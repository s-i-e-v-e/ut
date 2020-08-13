/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {A} from "../parser/mod.ts";
import {clone, Dictionary, Errors, Int, Logger} from "../util/mod.ts";
import {GenericMap} from "./mod.internal.ts";
import SymbolTable from "./SymbolTable.ts";

type Type = A.Type;
type Location = A.Location;

export default class TypeResolver {
    constructor(private readonly st: SymbolTable) {}

    private typesMatch(ot1: Type, ot2: Type, noTypeParams: boolean = false): boolean {
        return this.st.rewriteType(ot1).mangledName === this.st.rewriteType(ot2).mangledName;
        /*todo: const filter = (xs: A.Type[]) => xs.filter(x => x.id.length > 1);

        let t1 = this.st.getType(ot1.id) as A.ParametricType;
        let t2 = this.st.getType(ot2.id) as A.ParametricType;

        t1 = noTypeParams ? ((t1 && filter(t1.typeParams).length >= filter(ot1.typeParams).length) ? t1 : ot1) : t1 || ot1;
        t2 = noTypeParams ? ((t2 && filter(t2.typeParams).length >= filter(ot2.typeParams).length) ? t2 : ot2) : t2 || ot2;

        Errors.ASSERT(!!t1, ot1.id);
        Errors.ASSERT(!!t2, ot2.id);

        if (t1.id !== t2.id) return false;
        if (t1.typeParams.length !== t2.typeParams.length) return false;

        for (let i = 0; i < t1.typeParams.length; i += 1) {
            if (!this.typesMatch(t1.typeParams[i], t2.typeParams[i], noTypeParams)) return false;
        }
        return true;*/
    }

    basicTypesMustMatch(t1: A.PrimitiveType, t2: A.PrimitiveType, loc: Location) {
        if (t1.id !== t2.id) Errors.Checker.raiseTypeMismatch(t1, t2, loc);
    }

    typesMustMatch(t1: Type, t2: Type, loc: Location) {
        if (!this.typesMatch(t1, t2)) Errors.Checker.raiseTypeMismatch(t1, t2, loc);
    }

    private addFunction(f: A.FunctionDef, mid: string) {
        Errors.ASSERT(f.type.mangledName === mid, `[fn]${f.type.mangledName} != [use]${mid}`);
        Logger.debug(`fn-reify: ${f.type.mangledName}`);
        this.st.addFunction(f);
    };

    private addStruct(s: A.StructType, mid: string) {
        Errors.ASSERT(s.mangledName === mid, `[fn]${s.mangledName} != [use]${mid}`);
        Logger.debug(`st-reify: ${s.mangledName}`);
        this.st.addStruct(s);
    };

    resolveStruct(id: string, mid: string, typeParams: A.Type[], argTypes: A.Type[], loc: Location, g: GenericMap<A.TypeDef>): A.StructType|undefined {
        const isReifiedStruct = !!argTypes.length;
        // match arity
        const xs = Object
            .keys(g[id])
            .map(x => g[id][x])
            .map(x => x as A.StructType)
            .filter(x => !!x.params)
            .filter(x => isReifiedStruct ? !x.freeTypeParams.length : x.params.length === argTypes.length);

        if (!xs.length) return undefined;
        Logger.debug(`st-res: ${id}:${xs.length} ... ${xs.map(y => y.mangledName).join("; ")} ... ${mid} (${Errors.buildLocation(loc)})`);
        const f = xs[0];

        if (!isReifiedStruct) {
            if (xs.length === 1) return f;
            Errors.ASSERT(xs.length === 1, mid, loc);
        }

        if (xs.length == 1 && f.freeTypeParams.length == 0 && typeParams.length === 0) {
            // regular struct
            for (let i = 0; i < argTypes.length; i += 1) {
                const at = argTypes[i];
                const pt = f.params[i].type;
                if (!this.typesMatch(at, pt, true)) return undefined;
            }
            this.addStruct(f, mid);
            return f;
        }

        for (const s of xs) {
            // check if all free type params can be bound
            const typeParams = new Set(s.freeTypeParams.map(x => x.id));
            return this.reifyStruct(s, argTypes, typeParams, {});
        }
        return undefined;
    }

    private reifyStruct(s: A.StructType, argTypes: A.Type[], typeParams: Set<string>, map: Dictionary<A.Type>) {
        const [_map, boundParamTypes] = this.mapTypes(argTypes, s.params.map(x => x.type), typeParams);
        map = map || _map;
        const allFreeTypeParamsBound = s.freeTypeParams.filter(x => map[x.id]).length == s.freeTypeParams.length;

        if (boundParamTypes.length && allFreeTypeParamsBound) {
            const rst = clone(s) as A.StructType;
            Errors.ASSERT(rst.params !== s.params);
            rst.freeTypeParams = [];
            rst.boundTypeParams = boundParamTypes;
            rst.params.forEach((p, i) => p.type = boundParamTypes[i])
            rst.mangledName =  A.mangleTypeName(rst.id, boundParamTypes);
            Errors.ASSERT(rst.mangledName !== s.mangledName);
            rst.tag = s.tag;
            this.addStruct(rst, rst.mangledName);
            return rst;
        }
        return undefined;
    }

    resolveFunction(id: string, mid: string, typeParams: A.Type[], argTypes: A.Type[], loc: Location, g: GenericMap<A.FunctionDef>): A.FunctionDef|undefined {
        // match arity
        const xs = Object
            .keys(g[id])
            .map(x => g[id][x])
            .filter(x => x.params.length === argTypes.length);

        if (!xs.length) return undefined;
        Logger.debug(`fn-res: ${id}:${xs.length} ... ${xs.map(y => y.type.mangledName).join("; ")} ... ${mid} (${Errors.buildLocation(loc)})`);
        const f = xs[0];
        if (xs.length == 1 && f.type.freeTypeParams.length == 0 && typeParams.length === 0) {
            // regular function
            for (let i = 0; i < argTypes.length; i += 1) {
                const at = argTypes[i];
                const pt = f.params[i].type;
                if (!this.typesMatch(at, pt, true)) return undefined;
            }
            //f.type.mangledName = mid;
            this.addFunction(f, mid);
            return f;
        }

        for (const f of xs) {
            // check if all free type params can be bound
            const ft = f.type;
            const typeParams = new Set(ft.freeTypeParams.map(x => x.id));
            const [map, boundParamTypes] = this.mapTypes(argTypes, f.params.map(x => x.type), typeParams);
            const allFreeTypeParamsBound = ft.freeTypeParams.filter(x => map[x.id]).length == ft.freeTypeParams.length;
            let returns = this.mapParametricTypes([ft.returns!], typeParams, map)[0];

            if (boundParamTypes.length && allFreeTypeParamsBound && returns/* && returns.takes.length == ft.returns.takes.length*/) {
                const y = A.mangleFunctionName(id, [], boundParamTypes);
                if (mid === y) {
                    // function can be reified
                    const rf: A.FunctionDef = clone(f) as A.FunctionDef;
                    const rft = rf.type;
                    rft.freeTypeParams = [];
                    rft.boundTypeParams = boundParamTypes;
                    rft.takes = boundParamTypes;
                    rft.returns = returns;
                    rf.params.map((p, i) => p.type = boundParamTypes[i]);

                    Errors.ASSERT(ft.mangledName !== y);
                    Errors.ASSERT(rf.params !== f.params);

                    rft.mangledName = y;

                    if (f.body) rf.body = (f as A.FunctionDef).body;
                    rf.tag = f.tag;
                    this.addFunction(rf, mid);
                    return rf;
                }
            }
        }
        return undefined;
    }

    private mapTypes(argTypes: A.Type[], paramTypes: A.Type[], typeParams: Set<string>, map?: Dictionary<A.Type>): [Dictionary<A.Type>, A.Type[]] {
        map = map || {};
        if (!argTypes.length) return [map, []];
        if (!paramTypes.length) return [map, []];
        const xs = [];
        for (let i = 0; i < argTypes.length; i += 1) {
            const at = argTypes[i];
            const pt = paramTypes[i];

            // bind each type param
            if (typeParams.has(pt.id)) {
                if (!map[pt.id]) {
                    map[pt.id] = at;

                    const [_map, ys] = this.mapTypes(A.getTypeParams(at), A.getTypeParams(pt), typeParams, map);
                    xs.push(A.newParametricType(at.id, at.loc, ys));
                }
                else {
                    if (map[pt.id].id !== at.id) return [map, []];
                    xs.push(at);
                }
            }
            else {
                const at_typeParams = A.getTypeParams(at);
                const pt_typeParams = A.getTypeParams(pt);
                if (at_typeParams.length && pt_typeParams.length) {
                    const [_map, ys] = this.mapTypes(at_typeParams, pt_typeParams, typeParams, map);
                    xs.push(A.newParametricType(at.id, at.loc, ys));
                }
                else {
                    if (!this.typesMatch(at, pt)) return [map, []];
                    xs.push(at);
                }
            }
        }
        return [map, xs];
    }

    private mapParametricTypes(paramTypes: A.Type[], typeParams: Set<string>, map: Dictionary<A.Type>): A.Type[] {
        if (!paramTypes.length) return [];
        const xs = [];
        for (let i = 0; i < paramTypes.length; i += 1) {
            const pt = paramTypes[i];

            if (typeParams.has(pt.id)) {
                Errors.ASSERT(!!map[pt.id]); // if it is a type param, then it was resolved
                xs.push(map[pt.id]);
            }
            else {
                const at = map[pt.id] || pt;
                const pt_typeParams = A.getTypeParams(pt);
                if (pt_typeParams.length) {
                    const argTypes = this.mapParametricTypes(pt_typeParams, typeParams, map);
                    const pft = pt as A.FunctionType;
                    const pst = pt as A.StructType;

                    if (pst.params) {
                        // struct type
                        const rst = this.reifyStruct(pst, argTypes, typeParams, map);
                        if (!rst) return [];
                        xs.push(rst);
                    }
                    else if (pft.takes) {
                        // function type
                        Errors.notImplemented();
                    }
                    else {
                        Errors.notImplemented();
                    }
                }
                else {
                    if (!this.typesMatch(at, pt)) return [];
                    xs.push(at);
                }
            }
        }
        return xs;
    }
}
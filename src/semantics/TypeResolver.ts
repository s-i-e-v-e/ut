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

    typeNotInferred(t: Type) {
        return t === A.Compiler.NotInferred;
    }

    rewriteType(t: Type): Type {
        Errors.ASSERT(t !== undefined);
        return  this.st.getType(t.id) || t;
    }

    isPointer(t: Type): boolean {
        t = this.rewriteType(t);
        return t.id === A.Language.ptr.id;
    }

    isBits(t: Type): boolean {
        t = this.rewriteType(t);
        return !!A.BitTypes.filter(x => x.id === t.id).length;
    }

    isInteger(t: Type): boolean {
        t = this.rewriteType(t);
        return !!A.IntegerTypes.filter(x => x.id === t.id).length;
    }

    isBoolean(t: Type): boolean {
        return t.id === A.Language.bool.id;
    }

    isString(t: Type): boolean {
        return t.id === A.Language.string.id;
    }

    typesMatch(ot1: Type, ot2: Type, noTypeParams: boolean = false): boolean {
        const filter = (xs: Type[]) => xs.filter(x => x.id.length > 1);
        if (this.isInteger(ot1) && this.isInteger(ot2)) return true;
        if (this.isBoolean(ot1) && this.isBoolean(ot2)) return true;
        if (this.isString(ot1) && this.isString(ot2)) return true;

        let t1 = this.st.getType(ot1.id);
        let t2 = this.st.getType(ot2.id);

        t1 = noTypeParams ? ((t1 && filter(t1.typeParams).length >= filter(ot1.typeParams).length) ? t1 : ot1) : t1 || ot1;
        t2 = noTypeParams ? ((t2 && filter(t2.typeParams).length >= filter(ot2.typeParams).length) ? t2 : ot2) : t2 || ot2;

        Errors.ASSERT(!!t1, ot1.id);
        Errors.ASSERT(!!t2, ot2.id);

        if (t1.id !== t2.id) return false;
        if (t1.typeParams.length !== t2.typeParams.length) return false;

        for (let i = 0; i < t1.typeParams.length; i += 1) {
            if (!this.typesMatch(t1.typeParams[i], t2.typeParams[i], noTypeParams)) return false;
        }
        return true;
    }

    typesMustMatch(t1: Type, t2: Type, loc: Location) {
        if (!this.typesMatch(t1, t2)) Errors.Checker.raiseTypeMismatch(t1, t2, loc);
    }

    typeExists(t: Type, loc: Location): boolean {
        const g = t;
        if (!this.st.getType(g.id)) return false;
        if (g.typeParams && g.typeParams.length) {
            let a = true;
            for (let i = 0; i < g.typeParams.length; i += 1) {
                a = a && this.typeExists(g.typeParams[i], loc);
            }
            return a;
        }
        else {
            return true;
        }
    }

    resolveFunction(id: string, mid: string, typeParams: Type[], argTypes: Type[], loc: Location, g: GenericMap<A.FunctionPrototype>) {
        // match arity
        const xs = Object
            .keys(g[id])
            .map(x => g[id][x])
            .filter(x => x.params.length === argTypes.length);

        if (!xs.length) return undefined;
        Logger.debug(`found: ${id}:${xs.length} ... ${xs.map(y => y.mangledName).join("; ")} ... ${mid} (${Errors.buildLocation(loc)})`);
        if (xs.length == 1 && xs[0].typeParams.length == 0 && typeParams.length === 0) {
            const f = xs[0];
            // regular function
            for (let i = 0; i < argTypes.length; i += 1) {
                const atype = argTypes[i];
                const ptype = f.params[i].type;
                if(!this.typesMatch(atype, ptype, true)) return undefined;
            }
            f.mangledName = mid;
            return f;
        }

        for (const f of xs) {
            const map: Dictionary<Type> = {};
            const tp: Dictionary<boolean> = {};
            f.typeParams.forEach(x => tp[x.id] = true);
            const ys = this.mapTypes(map, argTypes, f.params.map(x => x.type), tp);
            const zs = f.typeParams.filter(x => map[x.id]);
            let returns = this.mapGenericTypes(map, [f.returns!], tp)[0];

            if (ys.length && zs.length == f.typeParams.length && returns && returns.takes.length == f.returns!.takes.length) {
                for (const x of f.typeParams) {
                    if (!map[x.id]) break;
                }
                const y = A.mangleName(id, [], ys, returns);
                if (mid === y) {
                    const ff: A.FunctionPrototype = clone(f) as A.FunctionPrototype;
                    ff.typeParams = [];
                    ff.takes = ys;
                    ff.returns = returns;
                    ff.params.map((p, i) => p.type = ys[i]);
                    if (f.mangledName !== y) {
                        ff.mangledName = y;
                        Errors.ASSERT(f.mangledName !== y);
                        Errors.ASSERT(ff.params !== f.params);
                        if ((f as A.FunctionDef).body) {
                            (ff as A.FunctionDef).body = (f as A.FunctionDef).body;
                        }
                        (ff as A.FunctionDef).st = (f as A.FunctionDef).st;
                        Logger.debug(`reified: ${ff.mangledName}`);
                    }
                    else {
                        Errors.raiseDebug();
                    }
                    return ff;
                }
            }
        }
        return undefined;
    }

    mapTypes(map: Dictionary<Type>, argTypes: Type[], paramTypes: Type[], typeParams: Dictionary<boolean>): Type[] {
        if (!argTypes.length) return [];
        if (!paramTypes.length) return [];
        const xs = [];
        for (let i = 0; i < argTypes.length; i += 1) {
            const at = argTypes[i];
            const pt = paramTypes[i];

            if (typeParams[pt.id]) {
                if (!map[pt.id]) {
                    map[pt.id] = at;

                    const ys = this.mapTypes(map, at.typeParams, pt.typeParams, typeParams);
                    xs.push(A.newType(at.id, at.loc, ys));
                }
                else {
                    if (map[pt.id].id !== at.id) return [];
                    xs.push(at);
                }
            }
            else {
                if (at.typeParams.length && pt.typeParams.length) {
                    const ys = this.mapTypes(map, at.typeParams, pt.typeParams, typeParams);
                    xs.push(A.newType(at.id, at.loc, ys));
                }
                else {
                    if (!this.typesMatch(at, pt)) return [];
                    xs.push(at);
                }
            }
        }
        return xs;
    }

    mapGenericTypes(map: Dictionary<Type>, paramTypes: Type[], typeParams: Dictionary<boolean>): Type[] {
        if (!paramTypes.length) return [];
        const xs = [];
        for (let i = 0; i < paramTypes.length; i += 1) {
            const pt = paramTypes[i];

            if (typeParams[pt.id]) {
                if (!map[pt.id]) {
                    return [];
                }
                else {
                    xs.push(map[pt.id]);
                }
            }
            else {
                const at = map[pt.id] || pt;
                if (pt.typeParams.length) {
                    const argTypes = this.mapGenericTypes(map, pt.typeParams, typeParams);
                    const ys = this.mapTypes(map, argTypes, pt.takes, typeParams);

                    const ppt = clone(pt) as Type;
                    ppt.takes = ys;
                    ppt.typeParams = [];

                    const q = ppt as A.StructDef;
                    if (q.params) {
                        q.params.forEach((p, i) => p.type = ys[i]);
                    }
                    ppt.mangledName =  A.mangleName(ppt.id, [], ys);

                    xs.push(ppt);
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

/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    Dictionary,
    Errors,
    Logger,
} from "../util/mod.ts";
import {
    A,
} from "../parser/mod.ts";
import {
    TypeResolver,
    GenericMap,
} from "./mod.internal.ts";
type Location = A.Location;

interface AnalysisState {
    ret?: A.ReturnStmt;
}

interface Namespaces {
    import: Dictionary<A.Import>;
    types: GenericMap<A.TypeDef>;
    functions: GenericMap<A.FunctionDef>;
    vars: Dictionary<A.Variable>;
}

type Resolve<T> = (st: SymbolTable, id: string) => T;

export default class SymbolTable {
    public readonly resolver: TypeResolver;
    private readonly ns: Namespaces;
    public readonly children: SymbolTable[];
    public readonly as: AnalysisState = {
        ret: undefined,
    };

    private constructor(public readonly name: string, public readonly parent?: SymbolTable) {
        this.ns = {
            import: {},
            types: {},
            functions: {},
            vars: {},
        };
        this.children = [];
        this.resolver = new TypeResolver(this);
    }

    private static add<T>(name: string, ns: Dictionary<T>, x: T) {
        const q = x as any as A.Primitive;
        Errors.ASSERT(!!q.loc);
        if (!!ns[name]) Errors.Checker.raiseDuplicateDef(name, q.loc);
        Errors.ASSERT(!ns[name], name);
        ns[name] = x;
    }

    private get<T>(id: string, resolve: Resolve<T>) {
        const mod = this.getModule();
        const t: SymbolTable = this;
        let xs = mod.getModules();
        xs = xs.filter(x => mod.ns.import[x.name]);
        xs = [t].concat(...xs);

        for (let x of xs) {
            let table: SymbolTable|undefined = x;
            while (table) {
                const y: T = resolve(table, id);
                if (y) return y;
                table = table.parent;
            }
        }
        return undefined;
    }

    private getModule() {
        let table: SymbolTable|undefined = this;
        let old: SymbolTable|undefined = this;
        while (table.parent) {
            old = table;
            table = table.parent;
        }
        return old;
    }

    private getModules() {
        let table: SymbolTable|undefined = this;
        while (table.parent) {
            table = table.parent;
        }
        return [table].concat(...table.children);
    }

    private exists<T>(id: string, resolve: Resolve<T>) {
        return this.get(id, resolve) !== undefined;
    }

    /** add **/
    addImport(im: A.Import) {
        SymbolTable.add(im.id, this.ns.import, im);
    }

    addFunction(x: A.FunctionDef) {
        Logger.debug(`#fn:${x.type.mangledName}`);
        if (!this.ns.functions[x.id]) {
            this.ns.functions[x.id] = {};
        }
        Errors.ASSERT(this.ns.functions[x.id][x.type.mangledName] === undefined, x.type.mangledName);
        this.ns.functions[x.id][x.type.mangledName] = x;
    }

    private addTypeDef(x: A.TypeDef) {
        Logger.debug(`#t:${x.mangledName}`);
        if (!this.ns.types[x.id]) {
            this.ns.types[x.id] = {};
            //this.ns.types[x.id][x.id] = x;
        }
        else {
            Errors.ASSERT(this.ns.types[x.id][x.mangledName] === undefined, x.mangledName, x.loc);
        }
        this.ns.types[x.id][x.mangledName] = x;
    }

    addStruct(t: A.StructType) {
        this.addTypeDef(t);
    }

    addPrimitiveType(t: A.PrimitiveType) {
        this.addTypeDef(t);
    }

    addFreeTypeParam(t: A.FreeTypeParam) {
        this.addTypeDef(t);
    }

    addTypeAlias(t: A.TypeAlias) {
        this.addTypeDef(t);
    }

    addVar(v: A.Variable) {
        SymbolTable.add(v.id, this.ns.vars, v);
    }

    /** is **/
    rewriteType(t: A.Type): A.Type {
        Errors.ASSERT(t !== undefined);
        if ((t as A.ParametricType).typeParams || (t as A.StructType).freeTypeParams) {
            return t;
        }
        else {
            if (t.id === A.Language.string.id) return A.Compiler.String;
            return this.getType(t.id) || t;
        }
    }

    isPointer(t: A.Type): boolean {
        t = this.rewriteType(t);
        return t.id === A.Language.ptr.id || t.id === A.Compiler.Pointer.id;
    }

    isBits(t: A.Type): boolean {
        t = this.rewriteType(t);
        return !!A.BitTypes.filter(x => x.id === t.id).length;
    }

    isInteger(t: A.Type): boolean {
        t = this.rewriteType(t);
        return !!A.IntegerTypes.filter(x => x.id === t.id).length;
    }

    isBoolean(t: A.Type): boolean {
        return t.id === A.Language.bool.id;
    }

    /** type check **/
    typeMustExist(t: A.Type, loc?: Location) {
        if (!this.typeExists(t)) return Errors.Checker.raiseUnknownType(t, loc || t.loc);
    }

    private typeExists(t: A.Type): boolean {
        return this.exists(t.id, (st, id) => {
            if (!st.ns.types[id]) return undefined;
            const x = st.ns.types[id][t.mangledName];

            if (!x) return this.getStruct(t, t.loc);
            const typeParams = A.getTypeParams(x);
            if (typeParams && typeParams.length) {
                for (let i = 0; i < typeParams.length; i += 1) {
                    const y = x.tag.typeExists(typeParams[i]);
                    if (!y) return y;
                }
            }
            return x;
        });
    }

    varExists(id: string) {
        return this.exists(id, (st, id) => st.ns.vars[id]);
    }

    typeNotInferred(t: A.Type) {
        return t === A.Compiler.NotInferred;
    }

    /** get **/
    getExistingVar(id: string, loc: Location) {
        const x = this.getVar(id);
        if (!x) return Errors.Checker.raiseUnknownIdentifier(id, loc);
        return x;
    }

    getVar(id: string): A.Variable|undefined {
        return this.get(id, (st, id) => st.ns.vars[id]);
    }

    getAllFunctions(id: string): A.FunctionDef[]|undefined {
        const  m = this.getModule();
        return Object.keys(m.ns.functions[id]).map(k => m.ns.functions[id][k]);
    }

    getExistingFunction(typeParams: A.Type[], argTypes: A.Type[], id: string, loc: Location): A.FunctionDef {
        const x = this.getFunction(id, loc, typeParams, argTypes);
        if (!x) return Errors.Checker.raiseUnknownFunction(`${id}(${argTypes.map(x => A.toTypeString(x)).join(", ")})`, loc);
        return x;
    }

    private getFunction(id: string, loc: Location, typeParams: A.Type[], argTypes: A.Type[]): A.FunctionDef|undefined {
        return this.get(id, (st, id) => {
            if (!st.ns.functions[id]) return undefined;
            Errors.breakIf(id == "sys-free");
            argTypes = argTypes.map(x => this.rewriteType(x));
            const mid = A.mangleFunctionName(id, typeParams, argTypes);
            if (st.ns.functions[id][mid]) return st.ns.functions[id][mid];
            return st.resolver.resolveFunction(id, mid, typeParams, argTypes, loc, st.ns.functions);
        });
    }

    getStruct(x: string|A.Type, loc: Location): A.StructType|undefined {
        if (typeof x === "string") {
            const id = x as string;
            return this.getType(id, loc) as A.StructType;
        }
        else {
            const t = x as A.Type;
            const typeParams = A.getTypeParams(t);
            const ft = t as A.StructType;
            return this.getType(t.id, loc, typeParams, ft.params ? ft.params.map(x => x.type) : []) as A.StructType;
        }
    }

    private getType(id: string, loc?: Location, typeParams?: A.Type[], argTypes?: A.Type[]): A.TypeDef|undefined {
        const getAlias = (id: string) => this.get(id, (st, id) => {
            if (!st.ns.types[id]) return undefined;
            const a = st.ns.types[id][id] as A.TypeAlias;
            return a ? a.alias : undefined;
        });

        const _getType = (id: string, loc?: Location, typeParams?: A.Type[], argTypes?: A.Type[]): A.TypeDef|undefined => this.get(id, (st, id) => {
            typeParams =  typeParams || [];
            argTypes =  argTypes || [];
            loc = loc || A.UnknownLoc;
            if (!st.ns.types[id]) return undefined;
            const mid = A.mangleTypeName(id, typeParams);
            if (st.ns.types[id][mid]) return st.ns.types[id][mid];
            return st.resolver.resolveStruct(id, mid, typeParams, argTypes, loc, st.ns.types);
        });

        // resolve alias
        let a = getAlias(id);
        let b = a;
        while (a) {
            b = a;
            a = getAlias(a.id);
        }
        return b ? _getType(b.id) : _getType(id, loc, typeParams, argTypes);
    }

    newTable(name: string, tag?: A.Tag) {
        const x = SymbolTable.build(name, this);
        this.children.push(x);
        if (tag) tag.tag = x;
        return x;
    }

    static build(name: string, parent?: SymbolTable) {
        return new SymbolTable(name, parent);
    }
}
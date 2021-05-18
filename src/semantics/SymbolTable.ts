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
    types: Dictionary<A.Type>;
    typeDefinitions: Dictionary<A.TypeDef>;
    structs: GenericMap<A.StructDef>;
    functions: GenericMap<A.FunctionPrototype>;
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
            typeDefinitions: {},
            structs: {},
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

    typeMustExist(t: A.Type, loc?: Location) {
        if (!this.typeExists(t)) return Errors.Checker.raiseUnknownType(t, loc || t.loc);
    }

    typeExists(t: A.Type) {
        return this.exists(t.id, (st, id) => st.ns.types[id]);
    }

    varExists(id: string) {
        return this.exists(id, (st, id) => st.ns.vars[id]);
    }

    addImport(im: A.Import) {
        SymbolTable.add(im.id, this.ns.import, im);
    }

    addFunction(x: A.FunctionPrototype) {
        Logger.debug(`#fn:${x.mangledName}`);
        if (!this.ns.functions[x.id]) {
            this.ns.functions[x.id] = {};
        }
        Errors.ASSERT(this.ns.functions[x.id][x.mangledName] === undefined, x.mangledName);
        this.ns.functions[x.id][x.mangledName] = x;
    }

    addStruct(x: A.StructDef) {
        Logger.debug(`#st:${x.mangledName}`);
        if (!this.ns.structs[x.id]) {
            this.ns.structs[x.id] = {};
        }
        Errors.ASSERT(this.ns.structs[x.id][x.mangledName] === undefined, x.mangledName);
        this.ns.structs[x.id][x.mangledName] = x;
    }

    addType(t: A.Type) {
        SymbolTable.add(t.id, this.ns.types, t);
    }

    addTypeParameter(t: A.Type) {
        this.addType(t);
    }

    addTypeDef(t: A.TypeDef) {
        const type = A.newType(t.id, t.loc);
        this.addType(type);
        SymbolTable.add(t.id, this.ns.typeDefinitions, t);
    }

    addVar(v: A.Variable) {
        SymbolTable.add(v.id, this.ns.vars, v);
    }

    getType(id: string): A.Type|undefined {
        return this.getTypeAlias(id) || this.get(id, (st, id) => st.ns.types[id]);
    }

    private getTypeAlias(id: string): A.Type|undefined {
        const x = this.get(id, (st, id) => st.ns.typeDefinitions[id]) as A.TypeDef;
        if (x) {
            return this.getType(x.type.id) || x.type;
        }
        else {
            return undefined;
        }
    }

    getVar(id: string): A.Variable|undefined {
        return this.get(id, (st, id) => st.ns.vars[id]);
    }

    getAllFunctions(id: string): A.FunctionPrototype[]|undefined {
        const  m = this.getModule();
        return Object.keys(m.ns.functions[id]).map(k => m.ns.functions[id][k]);
    }

    getFunction(id: string, loc: Location, typeParams: A.Type[], argTypes: A.Type[]): A.FunctionPrototype|undefined {
        return this.get(id, (st, id) => {
            if (!st.ns.functions[id]) return undefined;
            const mid = A.mangleName(id, typeParams, argTypes, A.Compiler.NotInferred);
            if (st.ns.functions[id][mid]) return st.ns.functions[id][mid];
            const x = st.resolver.resolveFunction(id, mid, typeParams, argTypes, loc, st.ns.functions);
            if (x) {
                Logger.debug(`adding: ${x.mangledName}`);
                Errors.ASSERT(x.mangledName === mid, `[fn]${x.mangledName} != [use]${mid}`);
                st.addFunction(x);
            }
            return x;
        });
    }

    getStruct(id: string, loc?: Location, typeParams?: A.Type[], argTypes?: A.Type[]): A.StructDef|undefined {
        return this.get(id, (st, id) => {
            typeParams =  typeParams || [];
            argTypes =  argTypes || [];
            loc = loc || A.UnknownLoc;
            if (!st.ns.structs[id]) return undefined;
            const mid = A.mangleName(id, typeParams, argTypes, A.Compiler.NotInferred);
            if (st.ns.structs[id][mid]) return st.ns.structs[id][mid];
            const x = st.resolver.resolveFunction(id, mid, typeParams, argTypes, loc, st.ns.structs);
            if (x) {
                Logger.debug(`adding: ${x.mangledName}`);
                Errors.ASSERT(x.mangledName === mid, `[st]${x.mangledName} != [use]${mid}`);
                st.addStruct(x);
                return x;
            }
            else {
                return Object.keys(st.ns.structs[id]).map(k => st.ns.structs[id][k])[0];
            }
        });
    }

    newTable(name: string) {
        const x = SymbolTable.build(name, this);
        this.children.push(x);
        return x;
    }

    static build(name: string, parent?: SymbolTable) {
        return new SymbolTable(name, parent);
    }
}
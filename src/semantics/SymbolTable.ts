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
} from "../util/mod.ts";
import {
    P,
    A,
} from "../parser/mod.ts";

interface AnalysisState {
    ret?: A.ReturnExpr;
}

interface FunctionPrototypes {
    map: Dictionary<P.FunctionPrototype>;
}

interface Namespaces {
    functions: Dictionary<FunctionPrototypes>;
    structs: Dictionary<P.Struct>;
    types: Dictionary<P.Type>;
    vars: Dictionary<P.Variable>;
}

type Resolve<T> = (ns: Namespaces, id: string) => T;

export default class SymbolTable {
    private readonly ns: Namespaces;
    public readonly as: AnalysisState = {
        ret: undefined,
    };

    private constructor(public readonly parent?: SymbolTable) {
        this.ns = {
            functions: {},
            structs: {},
            types: {},
            vars: {},
        };
    }

    private static add<T>(name: string, ns: Dictionary<T>, x: T) {
        if (ns[name]) Errors.raiseDebug(name);
        ns[name] = x;
    }

    private get<T>(id: string, resolve: Resolve<T>) {
        let table: SymbolTable|undefined = this;
        while (table) {
            const x: T = resolve(table.ns, id);
            if (x) return x;
            table = table.parent || undefined;
        }
        return undefined;
    }

    private exists<T>(id: string, resolve: Resolve<T>) {
        let table: SymbolTable|undefined = this;
        while (table) {
            if (resolve(table.ns, id)) return true;
            table = table.parent || undefined;
        }
        return false;
    }

    typeExists(t: P.Type) {
        return this.exists(t.id, (ns, id) => ns.types[id]);
    }

    varExists(id: string) {
        return this.exists(id, (ns, id) => ns.vars[id]);
    }

    addFunction(fp: P.FunctionPrototype) {
        const exists = this.ns.functions[fp.id] !== undefined;
        const m = this.ns.functions[fp.id] || { map: {} };
        if (m.map[fp.mangledName]) Errors.raiseDebug();
        m.map[fp.mangledName] = fp;
        if (!exists) SymbolTable.add(fp.id, this.ns.functions, m);
    }

    addStruct(s: P.Struct) {
        SymbolTable.add(s.type.id, this.ns.structs, s);
    }

    addType(t: P.Type) {
        SymbolTable.add(t.id, this.ns.types, t);
    }

    addVar(v: P.Variable) {
        SymbolTable.add(v.id, this.ns.vars, v);
    }

    getType(id: string) {
        return this.get(id, (ns, id) => ns.types[id]);
    }

    getVar(id: string) {
        return this.get(id, (ns, id) => ns.vars[id]);
    }

    getFunction(id: string, argTypes: P.Type[]) {
        const mn = P.mangleName(id, argTypes);
        return this.get(id, (ns, id) => ns.functions[id] ? ns.functions[id].map[mn] : undefined);
    }

    getStruct(id: string) {
        return this.get(id, (ns, id) => ns.structs[id]);
    }

    newTable() {
        return SymbolTable.build(this);
    }

    static build(parent?: SymbolTable) {
        return new SymbolTable(parent);
    }
}
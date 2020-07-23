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
} from "./mod.ts";
import {
    Function,
    Struct,
    Type,
    Variable,
} from "../parser/mod.ts";

interface Namespaces {
    functions: Dictionary<Function>;
    structs: Dictionary<Struct>;
    types: Dictionary<Type>;
    vars: Dictionary<Variable>;
}

type Resolve<T> = (ns: Namespaces, id: string) => T;

export default class SymbolTable {
    private readonly ns: Namespaces;

    private constructor(private readonly parent?: SymbolTable) {
        this.ns = {
            functions: {},
            structs: {},
            types: {},
            vars: {},
        };
    }

    private add<T>(name: string, ns: Dictionary<T>, x: T) {
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

    typeExists(t: Type) {
        return this.exists(t.id, (ns, id) => ns.types[id]);
    }

    varExists(id: string) {
        return this.exists(id, (ns, id) => ns.vars[id]);
    }

    addFunction(f: Function) {
        this.add(f.id, this.ns.functions, f);
    }

    addStruct(s: Struct) {
        this.add(s.type.id, this.ns.structs, s);
    }

    addType(t: Type) {
        this.add(t.id, this.ns.types, t);
    }

    addVar(v: Variable) {
        this.add(v.id, this.ns.vars, v);
    }

    getType(id: string) {
        return this.get(id, (ns, id) => ns.types[id]);
    }

    getVar(id: string) {
        return this.get(id, (ns, id) => ns.vars[id]);
    }

    getFunction(id: string) {
        return this.get(id, (ns, id) => ns.functions[id]);
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
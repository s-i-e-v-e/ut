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
    Location,
    P,
    A,
} from "../parser/mod.ts";
import {
    Types,
} from "./mod.internal.ts";

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

    addTypeParameter(t: P.Type) {
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

    getFunction(id: string, argTypes: P.Type[], loc: Location) {
        return this.get(id, (ns, id) => {
            if (!ns.functions[id]) return undefined;
            return matchFunction(id, argTypes, loc, ns.functions[id]);
        });
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

//
function matchFunction(id: string, argTypes: P.Type[], loc: Location, fp: FunctionPrototypes) {
    // match arity
    const xs = Object
        .keys(fp.map)
        .map(x => fp.map[x])
        .filter(x => x.params.length === argTypes.length);
    if (!xs.length) Errors.raiseFunctionParameterCountMismatch(id, loc);
    if (xs.length == 1 && xs[0].typeParameters.length == 0) {
        const f = xs[0];
        // regular function
        for (let i = 0; i < argTypes.length; i += 1) {
            const atype = argTypes[i];
            const ptype = f.params[i].type;
            Types.typesMustMatch(atype, ptype, loc);
        }
        return f;
    }

    for (const f of xs) {
        Errors.debug();
        const map: Dictionary<P.Type> = {};
        const ys = matchTypes(map, argTypes, f.params.map(x => x.type));
        if (ys.length) {
            for (const x of f.typeParameters) {
                if (!map[x.id]) return undefined;
            }
            const x = P.mangleName(id, ys);
            const y = P.mangleName(id, argTypes);
            if (x === y) return f;
        }
    }
    return undefined;
}

function matchTypes(map: Dictionary<P.Type>, argTypes: P.Type[], paramTypes: P.Type[]): P.Type[] {
    const xs = [];
    for (let i = 0; i < argTypes.length; i += 1) {
        const atype = argTypes[i];
        const ptype = paramTypes[i];
        if (!map[ptype.id]) {
            map[ptype.id] = atype;
            const gat = atype as P.GenericType;
            const gpt = ptype as P.GenericType;
            if (gat.typeParameters || gpt.typeParameters) {
                const ys = matchTypes(map, gat.typeParameters, gpt.typeParameters);
                xs.push({
                    id: atype.id,
                    typeParameters: ys,
                } as P.GenericType);
            }
            else {
                xs.push(atype);
            }
        }
        else if (map[ptype.id].id !== atype.id) {
            return [];
        }
    }
    return xs;
}
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
    ret?: A.ReturnStmt;
}

interface FunctionPrototypes {
    map: Dictionary<P.FunctionPrototype>;
}

interface Namespaces {
    types: Dictionary<P.Type>;
    typeDefinitions: Dictionary<P.TypeDefinition>;
    structs: Dictionary<P.Struct>;
    functions: Dictionary<FunctionPrototypes>;
    vars: Dictionary<P.Variable>;
}

type Resolve<T> = (ns: Namespaces, id: string) => T;

export default class SymbolTable {
    private readonly ns: Namespaces;
    public readonly children: SymbolTable[];
    public readonly as: AnalysisState = {
        ret: undefined,
    };

    private constructor(public readonly name: string, public readonly parent?: SymbolTable) {
        this.ns = {
            types: {},
            typeDefinitions: {},
            structs: {},
            functions: {},
            vars: {},
        };
        this.children = [];
    }

    private static add<T>(name: string, ns: Dictionary<T>, x: T) {
        if (ns[name]) Errors.raiseDebug(name);
        ns[name] = x;
    }

    private get<T>(id: string, resolve: Resolve<T>) {
        const t: SymbolTable = this;
        const xs = [t].concat(...this.getModules().filter(x => x.name !== t.name).slice());

        for (let x of xs) {
            let table: SymbolTable|undefined = x;
            while (table) {
                const y: T = resolve(table.ns, id);
                if (y) return y;
                table = table.parent
            }
        }
        return undefined;
    }

    private getModules() {
        let table: SymbolTable|undefined = this;
        while (table.parent) {
            table = table.parent;
        }
        return table.children;
    }

    private exists<T>(id: string, resolve: Resolve<T>) {
        return this.get(id, resolve) !== undefined;
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
        if (m.map[fp.mangledName]) Errors.raiseDebug(fp.mangledName);
        m.map[fp.mangledName] = fp;
        if (!exists) SymbolTable.add(fp.id, this.ns.functions, m);
    }

    addStruct(s: P.Struct) {
        SymbolTable.add(s.type.id, this.ns.structs, s);
    }

    addTypeDefinition(t: P.TypeDefinition) {
        SymbolTable.add(t.type.id, this.ns.typeDefinitions, t);
    }

    addType(t: P.Type) {
        SymbolTable.add(t.id, this.ns.types, t);
    }

    addTypeParameter(t: string) {
        SymbolTable.add(t, this.ns.types, P.Types.newType(t));
    }

    addVar(v: P.Variable) {
        SymbolTable.add(v.id, this.ns.vars, v);
    }

    getType(id: string): P.Type|undefined {
        return this.getTypeAlias(id) || this.get(id, (ns, id) => ns.types[id]);
    }

    getTypeCons(id: string): P.Type|undefined {
        const x = this.get(id, (ns, id) => ns.typeDefinitions[id]) as P.TypeDeclaration;
        if (x && x.cons) {
            const y = this.getType(x.cons.id) || x.cons;
            return this.getTypeCons(y.id) || y;
        }
        else {
            return undefined;
        }
    }

    private getTypeAlias(id: string): P.Type|undefined {
        const x = this.get(id, (ns, id) => ns.typeDefinitions[id]) as P.TypeAlias;
        if (x && x.alias) {
            return this.getType(x.alias.id) || x.alias;
        }
        else {
            return undefined;
        }
    }

    getVar(id: string) {
        return this.get(id, (ns, id) => ns.vars[id]);
    }

    getFunction(id: string, argTypes: P.Type[], loc: Location) {
        return this.get(id, (ns, id) => {
            if (!ns.functions[id]) return undefined;
            return matchFunction(this, id, argTypes, loc, ns.functions[id]);
        });
    }

    getStruct(id: string) {
        return this.get(id, (ns, id) => ns.structs[id]);
    }

    newTable(name: string, tag?: P.Tag) {
        const x = SymbolTable.build(name, this);
        this.children.push(x);
        if (tag) tag.tag = x;
        return x;
    }

    static build(name: string, parent?: SymbolTable) {
        return new SymbolTable(name, parent);
    }
}

//
function matchFunction(st: SymbolTable, id: string, argTypes: P.Type[], loc: Location, fp: FunctionPrototypes) {
    // match arity
    const xs = Object
        .keys(fp.map)
        .map(x => fp.map[x])
        .filter(x => x.params.length === argTypes.length);
    if (!xs.length) return undefined;
    if (xs.length == 1 && xs[0].typeParams.length == 0) {
        const f = xs[0];
        // regular function
        for (let i = 0; i < argTypes.length; i += 1) {
            const atype = argTypes[i];
            const ptype = f.params[i].type;
            if(!Types.typesMatch(st, atype, ptype)) return undefined;
        }
        return f;
    }

    const x = P.Types.mangleName(id, argTypes);
    for (const f of xs) {
        const map: Dictionary<P.Type> = {};
        const tp: Dictionary<boolean> = {};
        f.typeParams.forEach(x => tp[x] = true);
        const ys = mapTypes(st, map, argTypes, f.params.map(x => x.type), tp);
        if (ys.length) {
            for (const x of f.typeParams) {
                if (!map[x]) break;
            }
            const y = P.Types.mangleName(id, ys);
            if (x === y) return f;
        }
    }
    return undefined;
}

function mapTypes(st: SymbolTable, map: Dictionary<P.Type>, argTypes: P.Type[], paramTypes: P.Type[], typeParams: Dictionary<boolean>): P.Type[] {
    if (!argTypes.length) return [];
    if (!paramTypes.length) return [];
    const xs = [];
    for (let i = 0; i < argTypes.length; i += 1) {
        const at = argTypes[i];
        const pt = paramTypes[i];

        if (typeParams[pt.id]) {
            if (!map[pt.id]) {
                map[pt.id] = at;

                const ys = mapTypes(st, map, at.typeParams, pt.typeParams, typeParams);
                xs.push(P.Types.newType(at.id, at.loc, ys));
            }
            else {
                if (map[pt.id].id !== at.id) return [];
            }
        }
        else {
            if (at.typeParams.length || pt.typeParams.length) {
                const ys = mapTypes(st, map, at.typeParams, pt.typeParams, typeParams);
                xs.push(P.Types.newType(at.id, at.loc, ys));
            }
            else {
                if (!Types.typesMatch(st, at, pt)) return [];
                xs.push(at);
            }
        }
    }
    return xs;
}
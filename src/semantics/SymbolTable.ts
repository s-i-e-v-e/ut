/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    clone,
    Dictionary,
    Errors,
    Logger,
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
    import: Dictionary<P.Import>;
    types: Dictionary<P.Type>;
    typeDefinitions: Dictionary<P.TypeDecl>;
    structs: Dictionary<P.StructDef>;
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
            import: {},
            types: {},
            typeDefinitions: {},
            structs: {},
            functions: {},
            vars: {},
        };
        this.children = [];
    }

    private static add<T>(name: string, ns: Dictionary<T>, x: T) {
        Errors.ASSERT(!ns[name], name);
        ns[name] = x;
    }

    private get<T>(id: string, resolve: Resolve<T>) {
        const mod = this.getModule();
        const parents = this.getParents();
        const t: SymbolTable = this;
        const xs = [t].concat(...this.getModules().filter(x => x.name !== t.name).slice());

        for (let x of xs) {
            let table: SymbolTable|undefined = x;
            if (!(parents.filter(y => y.name === table!.name).length || mod.ns.import[table.name])) continue;
            while (table) {
                const y: T = resolve(table.ns, id);
                if (y) return y;
                table = table.parent;
            }
        }
        return undefined;
    }

    private getParents() {
        let table: SymbolTable|undefined = this;
        const xs = [];
        while (table.parent) {
            xs.push(table);
            table = table.parent;
        }
        return xs;
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

    typeMustExist(t: P.Type, loc?: Location) {
        if (!this.typeExists(t)) return Errors.Checker.raiseUnknownType(t, loc || t.loc);
    }

    typeExists(t: P.Type) {
        return this.exists(t.id, (ns, id) => ns.types[id]);
    }

    varExists(id: string) {
        return this.exists(id, (ns, id) => ns.vars[id]);
    }

    addImport(im: P.Import) {
        SymbolTable.add(im.id, this.ns.import, im);
    }

    addFunction(fp: P.FunctionPrototype) {
        Logger.debug(`#fn:${fp.mangledName}`);
        const exists = this.ns.functions[fp.id] !== undefined;
        const m = this.ns.functions[fp.id] || { map: {} };
        Errors.ASSERT(!m.map[fp.mangledName]);
        m.map[fp.mangledName] = fp;
        if (!exists) SymbolTable.add(fp.id, this.ns.functions, m);
    }

    addStruct(s: P.StructDef) {
        SymbolTable.add(s.type.id, this.ns.structs, s);
    }

    addTypeDecl(t: P.TypeDecl) {
        const type = P.Types.newType(t.id, t.loc, t.typeParams.map(y => P.Types.newType(y, t.loc)));
        this.addType(type);
        SymbolTable.add(t.id, this.ns.typeDefinitions, t);
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
        const x = this.get(id, (ns, id) => ns.typeDefinitions[id]) as P.TypeDef;
        if (x && x.isDef) {
            const y = this.getType(x.type.id) || x.type;
            return this.getTypeCons(y.id) || y;
        }
        else {
            return undefined;
        }
    }

    private getTypeAlias(id: string): P.Type|undefined {
        const x = this.get(id, (ns, id) => ns.typeDefinitions[id]) as P.TypeAliasDef;
        if (x && x.isAlias) {
            return this.getType(x.type.id) || x.type;
        }
        else {
            return undefined;
        }
    }

    getVar(id: string): P.Variable|undefined {
        return this.get(id, (ns, id) => ns.vars[id]);
    }

    getFunction(id: string, argTypes: P.Type[], loc: Location): P.FunctionPrototype|undefined {
        return this.get(id, (ns, id) => {
            if (!ns.functions[id]) return undefined;
            return matchFunction(this, id, argTypes, loc, ns.functions[id]);
        });
    }

    getStruct(id: string): P.StructDef|undefined {
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
    const x = P.Types.mangleName(id, argTypes);
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

    Logger.debug(`found: ${id}:${x}:${xs.length}: ${xs.map(y => y.mangledName).join("; ")}`);
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
            if (x === y) {
                const ff = clone(f);
                ff.params.map((p, i) => p.type = ys[i]);
                ff.typeParams = [];
                return ff;
            }
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
                xs.push(at);
            }
        }
        else {
            if (at.typeParams.length && pt.typeParams.length) {
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
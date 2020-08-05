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
    P,
    A,
} from "../parser/mod.ts";
import {
    TypeResolver,
    GenericMap,
} from "./mod.internal.ts";
type Location = P.Location;

interface AnalysisState {
    ret?: A.ReturnStmt;
}

export default class SymbolTable {
    public readonly as: AnalysisState = {
        ret: undefined,
    };

    private static add<T>(name: string, ns: Dictionary<T>, x: T) {
        const q = x as any as P.Primitive;
        Errors.ASSERT(!!q.loc);
        if (!!ns[name]) Errors.Checker.raiseDuplicateDef(name, q.loc);
        Errors.ASSERT(!ns[name], name);
        ns[name] = x;
    }

    varExists(id: string) {
        return this.exists(id, (st, id) => st.ns.vars[id]);
    }

    addImport(im: P.Import) {
        SymbolTable.add(im.id, this.ns.import, im);
    }

    addFunction(x: P.FunctionPrototype) {
        Logger.debug(`#fn:${x.mangledName}`);
        if (!this.ns.functions[x.id]) {
            this.ns.functions[x.id] = {};
        }
        Errors.ASSERT(this.ns.functions[x.id][x.mangledName] === undefined, x.mangledName);
        this.ns.functions[x.id][x.mangledName] = x;
    }

    addStruct(x: P.StructDef) {
        Logger.debug(`#st:${x.mangledName}`);
        if (!this.ns.structs[x.id]) {
            this.ns.structs[x.id] = {};
        }
        Errors.ASSERT(this.ns.structs[x.id][x.mangledName] === undefined, x.mangledName);
        this.ns.structs[x.id][x.mangledName] = x;
    }

    addType(t: P.Type) {
        SymbolTable.add(t.id, this.ns.types, t);
    }

    addTypeParameter(t: P.Type) {
        this.addType(t);
    }

    addTypeDecl(t: P.TypeDecl) {
        const type = P.Types.newType(t.id, t.loc, t.typeParams.map(y => P.Types.newType(y, t.loc)));
        this.addType(type);
        SymbolTable.add(t.id, this.ns.typeDefinitions, t);
    }

    addVar(v: P.Variable) {
        SymbolTable.add(v.id, this.ns.vars, v);
    }


}
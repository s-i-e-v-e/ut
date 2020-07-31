/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    Location,
    P,
} from "../parser/mod.ts";
import {Errors} from "../util/mod.ts";
import {SymbolTable} from "./mod.internal.ts";

const KnownTypes = P.KnownTypes;
type Type = P.Type;
type Variable = P.Variable;
type GenericType = P.GenericType;

export function typeNotInferred(t: Type) {
    return t === KnownTypes.NotInferred;
}

export function typesMatch(st: SymbolTable, xt1: Type, xt2: Type): boolean {
    const t1 = st.getType(xt1.id);
    const t2 = st.getType(xt2.id);
    const g1 = t1 as GenericType;
    const g2 = t2 as GenericType;
    if (!t1) Errors.raiseDebug();
    if (!t2) Errors.raiseDebug();

    let a = g1.id === g2.id || (g1.native && g2.native && g1.native.id === g2.native.id) === true;
    if (!a) return a;
    if (g1.typeParameters && g2.typeParameters) {
        if (g1.typeParameters.length !== g2.typeParameters.length) return false;
        for (let i = 0; i < g1.typeParameters.length; i += 1) {
            a = a && typesMatch(st, g1.typeParameters[i], g2.typeParameters[i]);
        }
        return a;
    }
    else if (!g1.typeParameters && !g2.typeParameters) {
        return a;
    }
    else {
        return false;
    }
}

export function typesMustMatch(st: SymbolTable, t1: Type, t2: Type, loc: Location) {
    if (!typesMatch(st, t1, t2)) Errors.raiseTypeMismatch(t1, t2, loc);
}

export function typeExists(st: SymbolTable, t: Type, loc: Location): boolean {
    const g = t as GenericType;
    if (!st.getType(g.id)) return false;
    if (g.typeParameters && g.typeParameters.length) {
        let a = true;
        for (let i = 0; i < g.typeParameters.length; i += 1) {
            a = a && typeExists(st, g.typeParameters[i], loc);
        }
        return a;
    }
    else {
        return true;
    }
}

export function rewrite(tv: Type|Variable) {
    const t = (tv as Variable).type || (tv as Type);
    t.loc = P.NativeLoc;
    const gt = t as GenericType;
    if (gt.typeParameters) gt.typeParameters.forEach(x => rewrite(x));
}

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

const NativeTypes = P.NativeTypes;
const KnownTypes = P.KnownTypes;
type Type = P.Type;
type Variable = P.Variable;

export function typeNotInferred(t: Type) {
    return t === KnownTypes.NotInferred;
}

export function isInteger(st: SymbolTable, t: Type): boolean {
    const x = st.getType(t.id);
    switch (x?.id) {
        case NativeTypes.Base.Word.id:
        case KnownTypes.SignedInt.id:
        {
            return true;
        }
        default: {
            return false;
        }
    }
}

export function isBoolean(st: SymbolTable, xt: Type): boolean {
    return xt.id === KnownTypes.Bool.id;
}

export function typesMatch(st: SymbolTable, t1: Type, t2: Type): boolean {
    if (isInteger(st, t1) && isInteger(st, t2)) return true;

    t1 = st.getType(t1.id)!;
    t2 = st.getType(t2.id)!;
    if (!t1) Errors.raiseDebug();
    if (!t2) Errors.raiseDebug();

    if (t1.id !== t2.id) return false;
    if (t1.typeParameters.length !== t2.typeParameters.length) return false;

    for (let i = 0; i < t1.typeParameters.length; i += 1) {
        if (!typesMatch(st, t1.typeParameters[i], t2.typeParameters[i])) return false;
    }
    return true;
}

export function typesMustMatch(st: SymbolTable, t1: Type, t2: Type, loc: Location) {
    if (!typesMatch(st, t1, t2)) Errors.raiseTypeMismatch(t1, t2, loc);
}

export function typeExists(st: SymbolTable, t: Type, loc: Location): boolean {
    const g = t;
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

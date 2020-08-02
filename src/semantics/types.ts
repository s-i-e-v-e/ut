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
import {SymbolTable, Types} from "./mod.internal.ts";

type Type = P.Type;

export function typeNotInferred(t: Type) {
    return t === P.Types.Compiler.NotInferred;
}

export function rewriteType(st: SymbolTable, t: P.Type, skipWord: boolean = false): P.Type {
    const x0 = st.getTypeCons(t.id);
    const x1 = x0 || st.getType(t.id)!;
    const y = x1 ? (st.getTypeCons(x1.id) || x1) : (x0 ? x0 : t);

    const xs = y.id.split("^");
    switch (y.typetype) {
        case P.Types.Word: {
            if (!skipWord) {
                y.id = P.Types.buildTypeID(P.Types.UnsignedInt, [64n]);
                y.typetype = P.Types.UnsignedInt;
            }
            y.native = P.Types.NativeUint;
            break;
        }
        case P.Types.SignedInt: {
            y.native = P.Types.nativeInt(BigInt(xs[1]), xs[0]);
            break;
        }
        case P.Types.UnsignedInt: {
            y.native = P.Types.nativeUint(BigInt(xs[1]), xs[0]);
            break;
        }
        case P.Types.Float: {
            const ys = xs[1].split("|");
            y.native = P.Types.nativeFloat(BigInt(ys[0]), BigInt(ys[1]), xs[0]);
            break;
        }
        case P.Types.Pointer: {
            y.native = P.Types.NativePointer;
            break;
        }
        /*case P.Types.Array: {
            y.native = P.Types.NativePointer;
            break;
        }*/
        default: {
            break;
        }
    }
    return y;
}

export function isInteger(st: SymbolTable, t: Type): boolean {
    const x = rewriteType(st, t, true);
    switch (x.typetype) {
        case P.Types.Word:
        case P.Types.UnsignedInt:
        case P.Types.SignedInt:
        {
            return true;
        }
        default: {
            return false;
        }
    }
}

export function isBoolean(st: SymbolTable, xt: Type): boolean {
    return xt.id === P.Types.Bool;
}

export function typesMatch(st: SymbolTable, ot1: Type, ot2: Type): boolean {
    if (isInteger(st, ot1) && isInteger(st, ot2)) return true;

    const t1 = st.getType(ot1.id) || ot1;
    const t2 = st.getType(ot2.id) || ot2;
    Errors.ASSERT(!!t1, ot1.id);
    Errors.ASSERT(!!t2, ot2.id);

    if (t1.id !== t2.id) return false;
    if (t1.typeParams.length !== t2.typeParams.length) return false;

    for (let i = 0; i < t1.typeParams.length; i += 1) {
        if (!typesMatch(st, t1.typeParams[i], t2.typeParams[i])) return false;
    }
    return true;
}

export function typesMustMatch(st: SymbolTable, t1: Type, t2: Type, loc: Location) {
    if (!typesMatch(st, t1, t2)) Errors.Checker.raiseTypeMismatch(t1, t2, loc);
}

export function typeExists(st: SymbolTable, t: Type, loc: Location): boolean {
    const g = t;
    if (!st.getType(g.id)) return false;
    if (g.typeParams && g.typeParams.length) {
        let a = true;
        for (let i = 0; i < g.typeParams.length; i += 1) {
            a = a && typeExists(st, g.typeParams[i], loc);
        }
        return a;
    }
    else {
        return true;
    }
}

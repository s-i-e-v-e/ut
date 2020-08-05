/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


export interface NativeType extends Primitive {
    typetype: string;
    bits: number;
}

export interface NativePointer extends NativeType {}

export interface NativeWord extends NativeType {}

export interface NativeFloat extends NativeType {
    exponent: number;
}

export class Types {

    public static readonly NativeNone = Types.nativeInt(0n, "");
    public static readonly NativePointer = Types.nativePointer("ptr");
    public static readonly NativeInt = Types.nativeInt(64n, "int");
    public static readonly NativeUint = Types.nativeUint(64n, "uint");
    public static readonly NativeFloat = Types.nativeFloat(80n, 15n, "float");

    public static readonly Word = "Word";
    public static readonly Pointer = "Pointer";
    public static readonly SignedInt = "SignedInt";
    public static readonly UnsignedInt = "UnsignedInt";
    public static readonly Float = "Float";
    public static readonly Array = "Array";
    public static readonly Bool = "Bool";

    public static readonly Compiler = {
        Word: Types.newType(Types.Word),
        Array: Types.newType(Types.Array),
        Bool: Types.newType(Types.Bool),
        NotInferred: Types.newType("NotInferred"),
        Void: Types.newType("Void"),
        String: Types.newType("String"),
    };



    public static newType(id: string, loc?: Location, typeParams?: Type[]): Type {
        typeParams = typeParams || [];
        return {
            loc: loc || UnknownLoc,
            id: id,
            typeParams: typeParams,
            takes: [],
            returns: undefined,
            mangledName: Types.mangleName(id, typeParams, []),
            typetype: id,
            native: Types.NativeNone,
        };
    }

    public static buildTypeID (id: string, xs: any[]) {
        return `${id}^${xs.map(x => x).join("|")}`
    }

    public static nativePointer (id: string): NativePointer {
        return {
            loc: Types.NativeLoc,
            id: Types.buildTypeID(id, [64]),
            typetype: id,
            bits: Number(64),
        };
    }

    public static nativeInt (bits: bigint, id: string): NativeWord {
        return {
            loc: Types.NativeLoc,
            id: Types.buildTypeID(id, [bits]),
            typetype: id,
            bits: Number(bits),
        };
    }

    public static nativeUint(bits: bigint, id: string): NativeWord {
        return {
            loc: Types.NativeLoc,
            id: Types.buildTypeID(id, [bits]),
            typetype: id,
            bits: Number(bits),
        };
    }

    public static nativeFloat(bits: bigint, exponent: bigint, id: string): NativeFloat {
        return {
            loc: Types.NativeLoc,
            id: Types.buildTypeID(id, [bits, exponent]),
            typetype: id,
            bits: Number(bits),
            exponent: Number(bits),
        };
    }

    public static
}
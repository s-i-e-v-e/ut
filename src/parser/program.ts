/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
    Location,
    A
} from "./mod.ts";

export interface Primitive {
    loc: Location;
}

export interface Tag {
    tag?: any;
}

export interface Module extends Primitive, Tag {
    id: string;
    path: string,
    types: TypeDefinition[],
    structs: Struct[],
    foreignFunctions: ForeignFunction[],
    functions: Function[],
    imports: Import[],
}

export interface Import extends Primitive {
    id: string;
}

export interface FunctionPrototype extends Primitive, Tag {
    id: string;
    params: Parameter[];
    type: Type;
    typeParams: string[];
    mangledName: string;
}

export interface Function extends FunctionPrototype {
    body: A.BlockExpr;
}

export interface ForeignFunction extends FunctionPrototype {}

export interface Struct extends Primitive {
    members: Variable[];
    type: Type;
    typeParams: string[];
}

export interface NativeType extends Primitive {
    id: string;
    typetype: string; // typetype
    bits: number;
}

export interface NativePointer extends NativeType {}

export interface NativeWord extends NativeType {}

export interface NativeFloat extends NativeType {
    exponent: number;
}

export interface Type extends Primitive {
    id: string;
    typeParams: Type[];
    typetype: string // typetype
    native: NativeType;
}

export interface TypeDefinition extends Primitive {
    type: Type;
}

export interface TypeAlias extends TypeDefinition {
    alias: Type;
}

export interface TypeDeclaration extends TypeDefinition {
    cons: Type;
    params: A.Literal<any>[];
}

export interface Variable extends Primitive {
    id: string;
    type: Type;
    isMutable: boolean;
    isPrivate: boolean;
    isVararg: boolean;
}

export type Parameter = Variable;



export const UnknownLoc = {
    index: 0,
    line: 1,
    character: 1,
    path: "<unknown>",
};

export class Types {
    public static readonly NativeModule = "<native>";
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

    public static readonly NativeLoc = {
        index: 0,
        line: 1,
        character: 1,
        path: Types.NativeModule,
    };

    public static newType(id: string, loc?: Location, typeParams?: Type[]): Type {
        return {
            id: id,
            typetype: id,
            loc: loc || UnknownLoc,
            typeParams: typeParams || [],
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

    public static toTypeString(t: Type, xs?: Array<string>) {
        const g = t;
        xs = xs ? xs : [""];
        xs.push(g.id)
        if (g.typeParams.length) {
            xs.push("[");
            for (let i = 0; i < g.typeParams.length; i += 1) {
                this.toTypeString(g.typeParams[i], xs);
            }
            xs.push("]");
        }
        return xs.join("");
    }

    public static mangleName(id: string, xs: Type[]) {
        const mangleTypes = (xs: Type[]): string => {
            const ys = [];
            for (const x of xs) {
                ys.push(`$${x.id}`);
                if (x.typeParams.length) {
                    ys.push("[");
                    ys.push(mangleTypes(x.typeParams));
                    ys.push("]");
                }
            }
            return ys.join("");
        };

        const ys = [];
        ys.push(id);
        ys.push(mangleTypes(xs));
        return ys.join("");
    }

    public static buildVar(id: string, type: Type, isMutable: boolean, isVararg: boolean, isPrivate: boolean, loc: Location) {
        return {
            id: id,
            type: type,
            isMutable: isMutable,
            isPrivate: isPrivate,
            isVararg: isVararg,
            loc: loc,
        };
    }
}
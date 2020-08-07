/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
    A
} from "./mod.ts";
import {int} from "../util/mod.ts";

export interface Tag {
    tag?: any;
}

export interface Location {
    line: number;
    character: number;
    index: number;
    path: string;
}

export interface Primitive extends Tag {
    loc: Location;
    id: string;
}

export interface Type extends Primitive {
    typeParams: Type[];
    takes: Type[],
    returns: Type|undefined,
    mangledName: string;
    typetype: string
    native: NativeType;
}

export interface FunctionType extends Type {
    params: Variable[];
}
export interface StructType extends FunctionType {}

export interface Module extends Primitive {
    path: string,
    types: TypeDecl[],
    structs: StructDef[],
    foreignFunctions: ForeignFunctionDef[],
    functions: FunctionDef[],
    imports: Import[],
}

export interface Import extends Primitive {}

export interface StructDef extends StructType {}
export interface FunctionPrototype extends FunctionType {}
export interface ForeignFunctionDef extends FunctionPrototype {}
export interface FunctionDef extends FunctionPrototype {
    body: A.BlockExpr;
}

export interface NativeType extends Primitive {
    typetype: string;
    bits: number;
}

export interface NativePointer extends NativeType {}

export interface NativeWord extends NativeType {}

export interface NativeFloat extends NativeType {
    exponent: number;
}

export interface TypeDecl extends Primitive {
    typeParams: string[];
    type: Type;
}
export interface TypeAliasDef extends TypeDecl {
    isAlias: boolean,
}

export interface TypeDef extends TypeDecl {
    isDef: boolean,
    args: A.Literal<any>[];
}

export interface Variable extends Primitive {
    type: Type;
    isMutable: boolean;
    isPrivate: boolean;
    isVararg: boolean;
}

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

    public static readonly Pointer = "Pointer";
    public static readonly SignedInt = "SignedInt";
    public static readonly UnsignedInt = "UnsignedInt";
    public static readonly Float = "Float";
    public static readonly Array = "Array";
    public static readonly Bool = "Bool";
    public static readonly String = "String";

    public static readonly Compiler = {
        IntegerLiteral: Types.newType("Compiler-Integer"),
        Array: Types.newType(Types.Array),
        BoolLiteral: Types.newType("Compiler-Bool"),
        NotInferred: Types.newType("NotInferred"),
        Void: Types.newType("Void"),
        StringLiteral: Types.newType("String"),
    };

    public static readonly NativeLoc = {
        index: 0,
        line: 1,
        character: 1,
        path: Types.NativeModule,
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

    public static newFunctionType(id: string, loc: Location, typeParams: Type[], returns: Type, params: Variable[]): FunctionType {
        const takes = params.map(x => x.type);
        return {
            loc: loc || UnknownLoc,
            id: id,
            typeParams: typeParams,
            takes: takes,
            returns: returns,
            params: params,
            mangledName: Types.mangleName(id, typeParams, takes, returns),
            typetype: id,
            native: Types.NativeNone,
        };
    }

    public static newStructType(id: string, loc: Location, typeParams: Type[], params: Variable[]): StructType {
        const takes = params.map(x => x.type);
        return {
            loc: loc || UnknownLoc,
            id: id,
            typeParams: typeParams,
            takes: takes,
            returns: Types.Compiler.Void,
            params: params,
            mangledName: Types.mangleName(id, typeParams, takes),
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

    public static nativeInt (bits: int, id: string): NativeWord {
        return {
            loc: Types.NativeLoc,
            id: Types.buildTypeID(id, [bits]),
            typetype: id,
            bits: Number(bits),
        };
    }

    public static nativeUint(bits: int, id: string): NativeWord {
        return {
            loc: Types.NativeLoc,
            id: Types.buildTypeID(id, [bits]),
            typetype: id,
            bits: Number(bits),
        };
    }

    public static nativeFloat(bits: int, exponent: int, id: string): NativeFloat {
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
                Types.toTypeString(g.typeParams[i], xs);
            }
            xs.push("]");
        }
        return xs.join("");
    }

    public static mangleName(id: string, typeParams: Type[], takes: Type[], returns?: Type) {
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
        ys.push(`${id}`);
        if (typeParams.length) {
            ys.push("[");
            ys.push(mangleTypes(typeParams));
            ys.push("]");
        }
        ys.push("(");
        ys.push(mangleTypes(takes));
        ys.push(")");
        /*if (returns) {
            ys.push(":");
            ys.push(mangleTypes([returns]));
        }*/
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
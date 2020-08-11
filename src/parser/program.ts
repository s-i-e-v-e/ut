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
import {Dictionary, int, object_values} from "../util/mod.ts";

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
}

export interface FunctionType extends Type {
    params: Variable[];
}
export interface StructType extends FunctionType {}

export interface Module extends Primitive {
    path: string,
    types: TypeDef[],
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

export interface TypeDef extends Primitive {
    type: Type;
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

    public static readonly Pointer = "Pointer";
    public static readonly Array = "Array";

    public static readonly NativeLoc = {
        index: 0,
        line: 1,
        character: 1,
        path: Types.NativeModule,
    };

    public static readonly Compiler = {
        Array: Types.newType(Types.Array),
        NotInferred: Types.newType("NotInferred"),
        Void: Types.newType("Void"),
    };

    public static readonly Language = {
        ptr: Types.newType("ptr", Types.NativeLoc),
        b8: Types.newType("b8", Types.NativeLoc),
        b16: Types.newType("b16", Types.NativeLoc),
        b32: Types.newType("b32", Types.NativeLoc),
        b64: Types.newType("b64", Types.NativeLoc),
        b128: Types.newType("b128", Types.NativeLoc),
        u8: Types.newType("u8", Types.NativeLoc),
        u16: Types.newType("u16", Types.NativeLoc),
        u32: Types.newType("u32", Types.NativeLoc),
        u64: Types.newType("u64", Types.NativeLoc),
        u128: Types.newType("u128", Types.NativeLoc),
        i8: Types.newType("i8", Types.NativeLoc),
        i16: Types.newType("i16", Types.NativeLoc),
        i32: Types.newType("i32", Types.NativeLoc),
        i64: Types.newType("i64", Types.NativeLoc),
        i128: Types.newType("i128", Types.NativeLoc),
        f8: Types.newType("f8", Types.NativeLoc), // 8_2
        f16: Types.newType("f16", Types.NativeLoc), // 16_5
        f32: Types.newType("f32", Types.NativeLoc), // 32_8
        f64: Types.newType("f64", Types.NativeLoc), // 64_11
        f80: Types.newType("f80", Types.NativeLoc), // 80_15
        f128: Types.newType("f128", Types.NativeLoc), // 128_15
        bool: Types.newType("bool"),
        String: Types.newType("String"), // struct String
    };

    public static readonly LanguageMap: Dictionary<Type> = Types.Language;

    public static readonly IntegerTypes = object_values<Type>(Types.Language).filter(x => x.id.startsWith("i") || x.id.startsWith("u"));
    public static readonly FloatTypes = object_values<Type>(Types.Language).filter(x => x.id.startsWith("f"));
    public static readonly BitTypes = object_values<Type>(Types.Language).filter(x => x.id.startsWith("b") && x.id !== Types.Language.bool.id);

    public static nativeSizeInBits(t: Type) {
        const map: Dictionary<Type> = this.Language;
        const x = map[t.id];
        if (!x) return 64;
        if (x.id === this.Language.bool.id) return 8;
        if (x.id === this.Language.String.id) return 64;
        if (x.id === this.Language.ptr.id) return 64;
        return Number(x.id.substring(1));
    }

    public static newType(id: string, loc?: Location, typeParams?: Type[]): Type {
        typeParams = typeParams || [];
        return {
            loc: loc || UnknownLoc,
            id: id,
            typeParams: typeParams,
            takes: [],
            returns: undefined,
            mangledName: Types.mangleName(id, typeParams, []),
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
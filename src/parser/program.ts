/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
    Location,
    A,
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
    typeParameters: Type[];
    mangledName: string;
}

export interface Function extends FunctionPrototype {
    body: A.BlockExpr;
}

export interface ForeignFunction extends FunctionPrototype {}

export interface Struct extends Primitive {
    members: Variable[];
    type: Type;
    typeParameters: Type[];
}

export interface NativeType extends Primitive {
    id: string;
    bits: number;
}

export interface NativeIntType extends NativeType {}

export interface NativeUintType extends NativeType {}

export interface NativeFloatType extends NativeType {
    exponent: number;
}

export interface NativeArrayType extends NativeType {
    bits: number;
}

export interface Type extends Primitive {
    id: string;
    typeParameters: Type[];
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

export const NativeModule = "<native>";
export const NativeLoc = {
    index: 0,
    line: 1,
    character: 1,
    path: NativeModule,
};

export const UnknownLoc = {
    index: 0,
    line: 1,
    character: 1,
    path: "<unknown>",
};

function buildTypeID(id: string, xs: any[]) {
    return `${id}^${xs.map(x => x).join("|")}`
}

export function nativeInt(bits: bigint, id: string): NativeIntType {
    return {
        loc: NativeLoc,
        id: buildTypeID(id, [bits]),
        bits: Number(bits),
    };
}

export function nativeUint(bits: bigint, id: string): NativeUintType {
    return {
        loc: NativeLoc,
        id: buildTypeID(id, [bits]),
        bits: Number(bits),
    };
}

export function nativeFloat(bits: bigint, exponent: bigint, id: string): NativeFloatType {
    return {
        loc: NativeLoc,
        id: buildTypeID(id, [bits, exponent]),
        bits: Number(bits),
        exponent: Number(bits),
    };
}

export function newNativeType(t: Type, native: NativeType): Type {
    const xs = [];
    xs.push(native.bits);
    const x = (native as NativeFloatType).exponent;
    if (x) xs.push(x);
    return {
        id: buildTypeID(t.id, xs),
        loc: NativeLoc,
        typeParameters: [],
        native: native,
    };
}

export function newType(id: string, loc?: Location, typeParameters?: Type[]): Type {
    return {
        id: id,
        loc: loc || UnknownLoc,
        typeParameters: typeParameters || [],
        native: NativeNone,
    };
}

export function newBaseType(id: string, native: NativeType): Type {
    return {
        id: id,
        loc: NativeLoc,
        typeParameters: [],
        native: native,
    };
}

const NativeNone = nativeInt(0n, "");
const NativeInt = nativeInt(64n, "int");
const NativeUint = nativeUint(64n, "uint");
const NativeUint8 = nativeUint(8n, "uint");
const NativeFloat = nativeFloat(80n, 15n, "float");

export const NativeTypes = {
    Base: {
        None: NativeNone,
        Word: newBaseType("Word", NativeNone),
        SignedInt: newBaseType("SignedInt", NativeInt),
        UnsignedInt: newBaseType("UnsignedInt", NativeUint),
        Float: newBaseType("Float", NativeFloat),
        Array: newBaseType("Array", NativeUint),
    },
};

export const KnownTypes = {
    NotInferred: newType("NotInferred"),
    Void: newType("Void"),
    Bool: newType("Bool"),
    String: newType("String"),
    Pointer: newType("Pointer"),
    Int64: newType("Int64"),
    SignedInt: newNativeType(NativeTypes.Base.SignedInt, NativeInt),
    UnsignedInt: newNativeType(NativeTypes.Base.UnsignedInt, NativeUint),
    Uint8: newNativeType(NativeTypes.Base.UnsignedInt, NativeUint8),
};

export function toTypeString(t: Type, xs?: Array<string>) {
    const g = t;
    xs = xs ? xs : [""];
    xs.push(g.id)
    if (g.typeParameters.length) {
        xs.push("[");
        for (let i = 0; i < g.typeParameters.length; i += 1) {
            toTypeString(g.typeParameters[i], xs);
        }
        xs.push("]");
    }
    return xs.join("");
}

function mangleTypes(xs: Type[]): string {
    const ys = [];
    for (const x of xs) {
        ys.push(`$${x.id}`);
        if (x.typeParameters.length) {
            ys.push("[");
            ys.push(mangleTypes(x.typeParameters));
            ys.push("]");
        }
    }
    return ys.join("");
}

export function mangleName(id: string, xs: Type[]) {
    const ys = [];
    ys.push(id);
    ys.push(mangleTypes(xs));
    return ys.join("");
}

export function buildVar(id: string, type: Type, isMutable: boolean, isVararg: boolean, isPrivate: boolean, loc?: Location) {
    return {
        id: id,
        type: type,
        isMutable: isMutable,
        isPrivate: isPrivate,
        isVararg: isVararg,
        loc: loc || UnknownLoc,
    };
}
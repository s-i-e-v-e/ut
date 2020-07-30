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

export interface Primitive {}

export interface Module extends Primitive {
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
    loc: Location;
}

export interface FunctionPrototype extends Primitive {
    id: string;
    params: Parameter[];
    type: Type;
    typeParameters: Type[];
    loc: Location;
    mangledName: string;
}

export interface Function extends Primitive {
    proto: FunctionPrototype,
    body: A.BlockExpr;
    loc: Location;
}

export interface ForeignFunction extends Primitive {
    proto: FunctionPrototype;
    loc: Location;
}

export interface Struct extends Primitive {
    members: Variable[];
    type: Type;
    typeParameters: Type[];
    loc: Location;
}

export interface NativeType extends Primitive {
    loc: Location;
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
    loc: Location;
    id: string;
    native?: NativeType;
}

export interface GenericType extends Type {
    typeParameters: Type[];
}

export interface TypeDefinition extends Primitive {
    loc: Location;
    type: Type;
}

export interface TypeAlias extends TypeDefinition {
    alias: Type;
}

export interface TypeDeclaration extends TypeDefinition {
    cons: Type;
    params: A.Literal[];
}

export interface Variable extends Primitive {
    id: string;
    type: Type;
    isMutable: boolean;
    isPrivate: boolean;
    isVararg: boolean;
    loc: Location;
}

export type Parameter = Variable;

export const SysLoc = {
    index: 0,
    line: 1,
    character: 1,
    path: "<system>",
};

export function nativeInt(bits: bigint, id?: string): NativeIntType {
    return {
        loc: SysLoc,
        id: id || NativeTypes.SignedInt.id,
        bits: Number(bits),
    };
}

export function nativeUint(bits: bigint): NativeUintType {
    return {
        loc: SysLoc,
        id: NativeTypes.UnsignedInt.id,
        bits: Number(bits),
    };
}

export function nativeFloat(bits: bigint, exponent: bigint): NativeFloatType {
    return {
        loc: SysLoc,
        id: NativeTypes.Float.id,
        bits: Number(bits),
        exponent: Number(bits),
    };
}

export function newNativeType(id: string, native: NativeType, loc?: Location): Type {
    return {
        id: id,
        loc: loc || SysLoc,
        native: native,
    };
}

export function newType(id: string, loc?: Location): Type {
    return {
        id: id,
        loc: loc || SysLoc,
    };
}

function newParameter(id: string, t: Type) {
    return {
        id: id,
        isMutable: false,
        type: t,
        loc: SysLoc,
    };
}

function newFunction(id: string, xs: Parameter[], type: Type) {
    return {
        id: id,
        params: xs,
        type: type,
        loc: SysLoc,
        body: [],
    };
}

export const NativeTypes = {
    Word: newNativeType("Word", nativeInt(64n, "uint")),
    SignedInt: newNativeType("SignedInt", nativeInt(64n, "int")),
    UnsignedInt: newNativeType("UnsignedInt", nativeInt(64n, "uint")),
    Float: newType("Float"),
    Array: newType("Array"),
};

export const KnownTypes = {
    NotInferred: newType("NotInferred"),
    Void: newType("Void"),
    Bool: newType("Bool"),
    String: newType("String"),
    Uint8: newType("Uint8"),
    Pointer: newType("Pointer"),
    Integer: newType("Integer"),
};

export function toTypeString(t: Type, xs?: Array<string>) {
    const g = t as GenericType;
    xs = xs ? xs : [""];
    xs.push(g.id)
    if (g.typeParameters && g.typeParameters.length) {
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
        const y = x as GenericType;
        if (y.typeParameters) {
            ys.push(mangleTypes(y.typeParameters));
        }
        else {
            ys.push(`$${x.id}`);
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
        loc: loc || SysLoc,
    };
}
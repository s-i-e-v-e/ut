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
    path: string,
    structs: Struct[],
    foreignFunctions: ForeignFunction[],
    functions: Function[],
}

export interface FunctionPrototype extends Primitive {
    id: string;
    params: Parameter[];
    type: Type;
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
    loc: Location;
}

export interface Type extends Primitive {
    id: string;
    loc: Location;
}

export interface GenericType extends Type {
    id: string;
    typeParameters: Type[];
}

export interface Variable extends Primitive {
    id: string;
    type: Type;
    isMutable: boolean;
    loc: Location;
}

export type Parameter = Variable;

export const SysLoc = {
    index: 0,
    line: 1,
    character: 1,
    path: "<system>",
};

function newType(id: string) {
    return {
        id: id,
        loc: SysLoc,
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

export const KnownTypes = {
    NotInferred: newType("NotInferred"),
    Void: newType("Void"),
    Bool: newType("Bool"),
    String: newType("String"),
    Integer: newType("Integer"),
    Uint8: newType("Uint8"),
    Pointer: newType("Pointer"),
    Array: newType("Array"),
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
/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
export interface Location {
    line: number;
    character: number;
    index: number;
    path: string;
}

export interface Primitive {
    tag?: any,
}

export interface Module {
    path: string,
    structs: Struct[],
    foreignFunctions: ForeignFunction[],
    functions: Function[],
}

export interface Block {
    returnType: Type;
}

export interface FunctionPrototype {
    id: string;
    params: Parameter[];
    returnType: Type;
    loc: Location;
}

export interface Function extends Primitive  {
    proto: FunctionPrototype,
    body: Stmt[];
    loc: Location;
}

export interface ForeignFunction extends Primitive  {
    proto: FunctionPrototype,
    loc: Location;
}

export interface Struct extends Primitive {
    type: Type;
    members: Variable[];
    loc: Location;
}

export interface Type {
    id: string;
    loc: Location;
}

export interface GenericType extends Type {
    id: string;
    typeParameters: Type[];
}

export interface Variable {
    id: string;
    type: Type;
    isMutable: boolean;
    loc: Location;
}

export type Parameter = Variable;

export enum NodeType {
    VarInitStmt,
    VarAssnStmt,
    FunctionApplicationStmt,
    IDExpr,
    FunctionApplication,
    IfExpr,
    IfStmt,
    StringLiteral,
    BooleanLiteral,
    NumberLiteral,
    ArrayConstructor,
    ReturnStmt,
    ReturnExpr,
    ArrayExpr,
    BinaryExpr,
    ForStmt,
}

export interface AstNode {
    nodeType: NodeType,
    loc: Location,
}
export interface Stmt extends AstNode {}

export interface VarInitStmt extends Stmt {
    var: Variable;
    expr: Expr;
}

export interface VarAssnStmt extends Stmt {
    lhs: IDExpr;
    rhs: Expr;
}

export interface FunctionApplicationStmt extends Stmt {
    fa: FunctionApplication;
}

export interface IfStmt extends Stmt {
    ie: IfExpr;
}

export interface ReturnStmt extends Stmt {
    expr: Expr;
}

export interface ForStmt extends Stmt {
    init: VarInitStmt;
    condition: Expr;
    update: VarAssnStmt;
    body: Stmt[];
}

export interface Expr extends AstNode {
    type: Type,
}

export interface LvalueExpr extends Expr {}
export interface RvalueExpr extends Expr {}

export interface IDExpr extends LvalueExpr {
    id: string;
}

export interface BinaryExpr extends RvalueExpr {
    left: Expr;
    op: string,
    right: Expr;
}

/**
 * note: As function application can return an lvalue, it can
 * be treated as an lvalue. But this can only be decided after
 * type-checking. To avoid needless complexity, we treat it as
 * an rvalue for now.
 *
 * There is a simple workaround for:
 * { foo()(0) = 7; } ----> { let x = foo(); x(0) = 7; }
 *
 */
export interface FunctionApplication extends RvalueExpr {
    id: string;
    args: Expr[];
}

export interface ArrayExpr extends RvalueExpr {
    id: string;
    args: Expr[];
}

export interface ArrayConstructor extends RvalueExpr {
    sizeExpr: Expr | undefined;
    args: Expr[] | undefined;
}

export interface IfExpr extends RvalueExpr {
    condition: Expr;
    ifBranch: Stmt[];
    elseBranch: Stmt[];
    returnType: Type;
}

export interface ReturnExpr extends RvalueExpr {
    expr: Expr;
}

export interface Literal extends RvalueExpr {}
export interface StringLiteral extends Literal {
    value: string,
}
export interface BooleanLiteral extends Literal {
    value: boolean,
}
export interface NumberLiteral extends Literal {
    value: BigInt,
}

export const InternalTypes = [
    "Bit8",
    "Bit16",
    "Bit32",
    "Bit64",
    "Int8",
    "Int16",
    "Int32",
    "Int64",
    "Uint8",
    "Uint16",
    "Uint32",
    "Uint64",
    "Float8",
    "Float16",
    "Float32",
    "Float64",
    "String",
    "Bool",
    "NotInferred",
    "Void",
    "Integer"
];

const SysLoc = {
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

function newFunction(id: string, xs: Parameter[], returnType: Type) {
    return {
        id: id,
        params: xs,
        returnType: returnType,
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
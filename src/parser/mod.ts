/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import CharacterStream from "./CharacterStream.ts";
import TokenStream from "./TokenStream.ts";
import lex from "./lexer.ts";
import {
    Errors,
    Logger,
    Dictionary,
    SourceFile,
} from "../util/mod.ts";

export interface Location {
    line: number;
    character: number;
    index: number;
    path: string;
}

export enum TokenType {
    TK_WHITESPACE = 128,
    TK_COMMENT,
    TK_ID,
    TK_TYPE,
    TK_STRING_LITERAL,
    TK_BOOLEAN_LITERAL,
    TK_BINARY_NUMBER_LITERAL,
    TK_OCTAL_NUMBER_LITERAL,
    TK_DECIMAL_NUMBER_LITERAL,
    TK_HEXADECIMAL_NUMBER_LITERAL,
    TK_INTERNAL
}

export interface Token {
    type: TokenType,
    loc: Location,
    lexeme: string,
}

export interface Module {
    path: string,
    functions: Function[],
    structs: Struct[],
}

export interface Function {
    id: string;
    params: Parameter[];
    returnType: Type;
    body: Stmt[];
    loc: Location;
}

export interface Struct {
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
    StringLiteral,
    BooleanLiteral,
    NumberLiteral,
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
    id: string;
    expr: Expr;
}

export interface FunctionApplicationStmt extends Stmt {
    fa: FunctionApplication;
}

export interface Expr extends AstNode {
    type: Type,
}

export interface LvalueExpr extends Expr {}
export interface RvalueExpr extends Expr {}

export interface IDExpr extends LvalueExpr {
    id: string;
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

const NotInferredType = newType("NotInferred");
const VoidType = newType("Void");
const BoolType = newType("Bool");
const StringType = newType("String");
const IntegerType = newType("Integer");

export const KnownTypes = {
    NotInferred: NotInferredType,
    Void: VoidType,
    Bool: BoolType,
    String: StringType,
    Integer: IntegerType,
};

export const KnownFunctions = {
    SysExit: newFunction("sys-exit", [newParameter("code", KnownTypes.Integer)], KnownTypes.Void),
    SysPrintln: newFunction("sys-println", [newParameter("s", KnownTypes.String)], KnownTypes.Void),
};

export {
    CharacterStream,
    TokenStream,
    Dictionary,
    Errors,
    Logger,
    SourceFile,
    lex,
};
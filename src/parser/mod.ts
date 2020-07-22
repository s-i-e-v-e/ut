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

export interface Function {
    id: string;
    params: Parameter[];
    returnType: Type;
    body: Stmt[];
}

export interface Type {
    id: string;
}

export interface GenericType extends Type {
    id: string;
    typeParameters: Type[];
}

export interface Parameter {
    id: string;
    type: Type;
}

export interface Expr {}

export interface LvalueExpr extends Expr {}
export interface RvalueExpr extends Expr {}

export interface Stmt {}

export interface VarDefStmt extends Stmt {
    id: string;
    type: string;
    expr: Expr;
}

export interface Literal extends RvalueExpr {}
export interface StringLiteral extends Literal {}
export interface BooleanLiteral extends Literal {}
export interface NumberLiteral extends Literal {}

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
    "`NotInferred"
];

export const NotInferred = {
    id: "`NotInferred"
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
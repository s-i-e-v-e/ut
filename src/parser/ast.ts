/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
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
    ReferenceExpr,
    DereferenceExpr,
    CastExpr,
}

import {
    Location,
    P,
} from "./mod.ts";

export interface AstNode {
    nodeType: NodeType,
    loc: Location,
}
export interface Stmt extends AstNode {}

export interface VarInitStmt extends Stmt {
    var: P.Variable;
    expr: Expr;
}

export interface VarAssnStmt extends Stmt {
    lhs: LvalueExpr;
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
    type: P.Type,
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

export interface CastExpr extends RvalueExpr {
    expr: Expr;
    type: P.Type,
}

export interface RefExpr extends LvalueExpr {
    emitValue: boolean;
}

export interface ReferenceExpr extends RvalueExpr {
    expr: LvalueExpr;
}

export interface DereferenceExpr extends RefExpr {
    expr: IDExpr;
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

export interface ArrayExpr extends RefExpr {
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
    returnType: P.Type;
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
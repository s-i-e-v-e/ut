/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
    A,
    P,
} from "./mod.ts";
import {int, Logger} from "../util/mod.ts";

type Location = P.Location;
export enum NodeType {
    ExprStmt,
    VarInitStmt,
    VarAssnStmt,
    ForStmt,
    ReturnStmt,

    StmtExpr,
    VoidExpr,
    CastExpr,
    GroupExpr,
    BlockExpr,
    StringLiteral,
    BooleanLiteral,
    NumberLiteral,
    IDExpr,
    TypeInstance,
    FunctionApplication,
    IfExpr,
    LocalReturnExpr,
    ArrayExpr,
    BinaryExpr,
    ReferenceExpr,
    DereferenceExpr,
    NegationExpr,
    NotExpr,
}

export function node_str(n: NodeType) {
    return NodeType[n];
}

export function node_print(n: NodeType) {
    Logger.debug(node_str(n));
}

export interface AstNode {
    nodeType: NodeType,
    loc: Location,
}
export interface Stmt extends AstNode {}

export interface ExprStmt extends Stmt {
    expr: Expr;
}

export interface VarInitStmt extends Stmt {
    var: P.Variable;
    expr: Expr;
}

export interface VarAssnStmt extends Stmt {
    lhs: Expr;
    rhs: Expr;
}

export interface ReturnStmt extends Stmt {
    expr: Expr;
}

export interface StmtExpr extends Expr {
    stmt: Stmt;
}

export interface ForStmt extends Stmt, P.Tag {
    init?: VarInitStmt;
    condition?: Expr;
    update?: VarAssnStmt;
    body: A.BlockExpr;
}

export interface Expr extends AstNode {
    type: P.Type,
}

export interface IDExpr extends Expr {
    id: string;
    rest: string[];
}

export interface BlockExpr extends Expr, P.Tag {
    parent?: BlockExpr;
    xs: Stmt[];
}

export interface ArrayExpr extends Expr {
    expr: IDExpr;
    args: Expr[];
}

export interface DereferenceExpr extends Expr {
    expr: IDExpr|DereferenceExpr;
}

export interface GroupExpr extends Expr {
    expr: Expr;
}

export interface BinaryExpr extends Expr {
    left: Expr;
    op: string,
    right: Expr;
}

export interface CastExpr extends Expr {
    expr: Expr;
    type: P.Type,
}

export interface ReferenceExpr extends Expr {
    expr: Expr;
}

export interface NegationExpr extends Expr {
    expr: Expr;
}

export interface NotExpr extends Expr {
    expr: Expr;
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
export interface FunctionApplication extends Expr {
    expr: IDExpr;
    typeParams: P.Type[];
    args: Expr[];
    mangledName?: string;
    oldStruct?: P.StructDef;
}

export interface IfExpr extends Expr {
    condition: Expr;
    ifBranch: A.BlockExpr;
    elseBranch: A.BlockExpr;
    isStmt: boolean;
}

export interface LocalReturnExpr extends Expr {
    expr: Expr;
}

export interface Literal<T> extends Expr {
    value: T;
}

export interface StringLiteral extends Literal<string> {}
export interface BooleanLiteral extends Literal<boolean> {}
export interface NumberLiteral extends Literal<int> {}

export function buildExprStmt(re: Expr, loc?: Location): ExprStmt {
    return {
        nodeType: NodeType.ExprStmt,
        expr: re,
        loc: loc || re.loc,
    };
}

export function buildVarAssnStmt(le: Expr, re: Expr): VarAssnStmt {
    return {
        nodeType: NodeType.VarAssnStmt,
        lhs: le,
        rhs: re,
        loc: le.loc,
    };
}

export function buildBinaryExpr(left: Expr, op: string, right: Expr): BinaryExpr {
    return {
        nodeType: NodeType.BinaryExpr,
        left: left,
        op: op,
        right: right,
        loc: left.loc,
        type: P.Types.Compiler.NotInferred,
    };
}

export function buildVoidExpr(loc: Location) {
    return {
        nodeType: NodeType.VoidExpr,
        type: P.Types.Language.void,
        loc: loc,
    };
}

export function buildBlockExpr(loc: Location, parent?: A.BlockExpr): A.BlockExpr  {
    return {
        nodeType: NodeType.BlockExpr,
        type: P.Types.Compiler.NotInferred,
        loc: loc,
        xs: new Array<any>(),
        parent: parent,
    };
}
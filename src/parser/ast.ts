/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
export enum NodeType {
    ExprStmt,
    VarInitStmt,
    VarAssnStmt,
    ForStmt,

    LExpr,
    RExpr,

    IDExpr,
    FunctionApplication,
    IfExpr,
    StringLiteral,
    BooleanLiteral,
    NumberLiteral,
    ArrayConstructor,
    ReturnExpr,
    ArrayExpr,
    BinaryExpr,
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

export interface ExprStmt extends Stmt {
    expr: RExpr;
}

export interface VarInitStmt extends Stmt {
    var: P.Variable;
    expr: RExpr;
}

export interface VarAssnStmt extends Stmt {
    lhs: LExpr;
    rhs: RExpr;
}

export interface ForStmt extends Stmt {
    init?: VarInitStmt;
    condition?: RExpr;
    update?: VarAssnStmt;
    body: Stmt[];
}

export interface Expr extends AstNode {
    type: P.Type,
}

export interface LVExpr extends Expr {}
export interface RVExpr extends Expr {}

export interface LExpr extends Expr {
    expr: LVExpr;
}

export interface RExpr extends Expr {
    expr: LVExpr|RVExpr;
}

export interface IDExpr extends LVExpr {
    id: string;
}

export interface RefExpr extends LVExpr {}

export interface ArrayExpr extends RefExpr {
    id: string;
    args: RExpr[];
}

export interface DereferenceExpr extends RefExpr {
    expr: IDExpr|DereferenceExpr;
}

export interface BinaryExpr extends RVExpr {
    left: RExpr;
    op: string,
    right: RExpr;
}

export interface CastExpr extends RVExpr {
    expr: LExpr;
    type: P.Type,
}

export interface ReferenceExpr extends RVExpr {
    expr: LExpr;
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
export interface FunctionApplication extends RVExpr {
    id: string;
    args: RExpr[];
}

export interface ArrayConstructor extends RVExpr {
    sizeExpr: RExpr | undefined;
    args: RExpr[] | undefined;
}

export interface IfExpr extends RVExpr {
    condition: RExpr;
    ifBranch: Stmt[];
    elseBranch: Stmt[];
}

export interface ReturnExpr extends RVExpr {
    expr: RExpr;
}

export interface Literal extends RVExpr {}
export interface StringLiteral extends Literal {
    value: string,
}
export interface BooleanLiteral extends Literal {
    value: boolean,
}
export interface NumberLiteral extends Literal {
    value: BigInt,
}

export function buildExprStmt(re: RExpr, loc?: Location): ExprStmt {
    return {
        nodeType: NodeType.ExprStmt,
        expr: re,
        loc: loc || re.loc,
    };
}

export function buildVarAssnStmt(le: LExpr, re: RExpr): VarAssnStmt {
    if (le.nodeType !== NodeType.LExpr) throw new Error();
    if (re.nodeType !== NodeType.RExpr) throw new Error();
    return {
        nodeType: NodeType.VarAssnStmt,
        lhs: le,
        rhs: re,
        loc: le.loc,
    };
}

export function buildLExpr(e: LVExpr, loc?: Location): LExpr {
    return {
        nodeType: NodeType.LExpr,
        expr: e,
        loc: loc || e.loc,
        type: e.type,
    };
}

export function buildRExpr(e: LVExpr|RVExpr, loc?: Location): LExpr {
    return {
        nodeType: NodeType.RExpr,
        expr: e,
        loc: loc || e.loc,
        type: e.type,
    };
}

export function buildBinaryExpr(left: RExpr, op: string, right: RExpr): BinaryExpr {
    return {
        nodeType: NodeType.BinaryExpr,
        left: left,
        op: op,
        right: right,
        loc: left.loc,
        type: P.KnownTypes.NotInferred,
    };
}
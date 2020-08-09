/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    P,
    A,
} from "../parser/mod.ts";
import {
    SymbolTable,
} from "./mod.internal.ts";
import {
    Errors,
    Logger,
} from "../util/mod.ts";

type Stmt = A.Stmt;
type Expr = A.Expr;
const NodeType = A.NodeType;

function doExpr(st: SymbolTable, block: A.BlockExpr, e: Expr) {
    switch (e.nodeType) {
        case NodeType.BooleanLiteral:
        case NodeType.StringLiteral:
        case NodeType.NumberLiteral: {
            break;
        }
        case NodeType.IDExpr: {
            // note: skip. primary var already handled during var-init
            break;
        }
        case NodeType.BinaryExpr: {
            const x = e as A.BinaryExpr;
            doExpr(st, block, x.left);
            doExpr(st, block, x.right);
            break;
        }
        case NodeType.FunctionApplication: {
            const x = e as A.FunctionApplication;
            x.args.forEach(y => doExpr(st, block, y));
            break;
        }
        case NodeType.ArrayExpr: {
            const x = e as A.ArrayExpr;
            doExpr(st, block, x.expr);
            doExpr(st, block, x.arg);
            break;
        }
        case NodeType.TypeInstance: {
            const x = e as A.FunctionApplication;
            x.args.forEach(y => doExpr(st, block, y));
            break;
        }
        case NodeType.LocalReturnExpr: {
            const x = e as A.LocalReturnExpr;
            doExpr(st, block, x.expr);
            break;
        }
        case NodeType.IfExpr: {
            const x = e as A.IfExpr;
            doExpr(st, block, x.condition);
            doBlock(x.ifBranch.tag, x.ifBranch);
            doBlock(x.elseBranch.tag, x.elseBranch);
            break;
        }
        case NodeType.CastExpr: {
            const x = e as A.CastExpr;
            doExpr(st, block, x.expr);
            break;
        }
        case NodeType.VoidExpr: {
            break;
        }
        case NodeType.ReferenceExpr: {
            const x = e as A.ReferenceExpr;
            doExpr(st, block, x.expr);
            break;
        }
        case NodeType.DereferenceExpr: {
            const x = e as A.DereferenceExpr;
            doExpr(st, block, x.expr);
            break;
        }
        case NodeType.BlockExpr: {
            const x = e as A.BlockExpr;
            doBlock(st, x);
            break;
        }
        case NodeType.GroupExpr: {
            const x = e as A.GroupExpr;
            doExpr(st, block, x.expr);
            break;
        }
        case NodeType.NegationExpr: {
            const x = e as A.NegationExpr;
            if (st.resolver.isBoolean(x.type)) {
                e.nodeType = NodeType.NotExpr;
            }
            doExpr(st, block, x.expr);
            break;
        }
        default: Errors.raiseDebug(NodeType[e.nodeType]);
    }
    e.type = st.resolver.rewriteType(e.type);
}

function rewriteVar(st: SymbolTable, block: A.BlockExpr, v: P.Variable) {
    const s = st.getConcreteStruct(v.type.id, v.type.mangledName);
    if (s) s.params.forEach((a: P.Variable) => rewriteVar(st, block, a));
    v.type = st.resolver.rewriteType(v.type);
    //Errors.ASSERT(P.Types.nativeSizeInBits(v.type) !== undefined, `Size needs to be known at compile-time: ${v.id}`, v.loc);
}

function doStmt(st: SymbolTable, block: A.BlockExpr, s: Stmt) {
    switch (s.nodeType) {
        case NodeType.VarInitStmt: {
            const x = s as A.VarInitStmt;
            x.var = st.getVar(x.var.id)!;
            rewriteVar(st, block, x.var);
            doExpr(st, block, x.expr);
            break;
        }
        case NodeType.VarAssnStmt: {
            const x = s as A.VarAssnStmt;
            doExpr(st, block, x.lhs);
            break;
        }
        case NodeType.ReturnStmt: {
            const x = s as A.ReturnStmt;
            let b = block;
            while (b.parent) {
                b = b.parent;
            }
            doExpr(st, b, x.expr);
            break;
        }
        case NodeType.ExprStmt: {
            const x = s as A.ExprStmt;
            if (x.expr.nodeType === NodeType.IfExpr) {
                const y = x.expr as A.IfExpr;
                y.isStmt = true;
            }
            doExpr(st, block, x.expr);
            break;
        }
        case NodeType.ForStmt: {
            const x = s as A.ForStmt;
            st = x.forBlock.tag;

            if (x.init) doStmt(st, x.forBlock, x.init);
            if (x.condition) doExpr(st, x.forBlock, x.condition);
            doBlock(x.body.tag, x.body);
            if (x.update) doStmt(st, x.forBlock, x.update);
            break;
        }
        default: Errors.raiseDebug(NodeType[s.nodeType]);
    }
    return [s];
}

function doBlock(st: SymbolTable, block: A.BlockExpr) {
    st = block.tag;
    const ys: Stmt[] = [];
    block.xs.forEach(y => ys.push(...doStmt(st, block, y)));
    block.xs = ys;
    return st;
}

function doFunction(st: SymbolTable, f: P.FunctionDef) {
    st = f.tag;
    const block = A.buildBlockExpr(f.loc);
    f.params.forEach(p => rewriteVar(st, block, p));
    doBlock(st, f.body);
    f.returns = st.resolver.rewriteType(f.returns!);
}

function doForeignFunction(st: SymbolTable, f: P.ForeignFunctionDef) {
    st = f.tag;
    const block = A.buildBlockExpr(f.loc);
    f.params.forEach(p => rewriteVar(st, block, p));
    f.returns = st.resolver.rewriteType(f.returns!);
}

function doStruct(st: SymbolTable, s: P.StructDef) {}

function doTypeDef(st: SymbolTable, t: P.TypeDef) {}

function doModule(st: SymbolTable, m: P.Module) {
    Logger.info(`Type rewriting: ${m.path}`);

    m.structs.forEach(x => doStruct(st, x));
    m.types.forEach(x => doTypeDef(st, x));

    for (const x of m.foreignFunctions) {
        doForeignFunction(st, x);
    }

    const xs = [];
    for (const x of m.functions) {
        xs.push(...(st.getAllFunctions(x.id) as P.FunctionDef[] || []));
    }
    m.functions = xs.filter(f => f.typeParams.length === 0);

    for (const x of m.functions) {
        doFunction(st, x);
    }
}

export default function rewrite(global: SymbolTable, mods: P.Module[]) {
    for (const m of mods) {
        doModule(m.tag, m);
    }
}
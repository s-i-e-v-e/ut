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
    Dictionary,
    Errors,
    Logger,
} from "../util/mod.ts";

const NativeTypes = P.NativeTypes;
type Stmt = A.Stmt;
type Expr = A.Expr;
const NodeType = A.NodeType;

function getNativeType(t: P.Type): P.NativeType {
    const xs = t.id.split("^");
    switch (xs[0]) {
        case NativeTypes.SignedInt.id: {
            return P.nativeInt(BigInt(xs[1]), xs[0]);
        }
        case NativeTypes.UnsignedInt.id: {
            return P.nativeUint(BigInt(xs[1]), xs[0]);
        }
        case NativeTypes.Float.id: {
            const ys = xs[1].split("|");
            return P.nativeFloat(BigInt(ys[0]), BigInt(ys[1]), xs[0]);
        }
        case NativeTypes.Array.id: {
            return NativeTypes.Array.native;
        }
        default: {
            return t.native;
        }
    }
}

function rewriteType(st: SymbolTable, t: P.Type): P.Type {
    const x = t.id === NativeTypes.Array.id ? t : (st.getType(t.id) || t);
    x.typeParams = x.typeParams.map(y => rewriteType(st, y));
    x.native = x.native === NativeTypes.None ? getNativeType(x) : x.native;
    return x;
}

function doExpr(st: SymbolTable, block: A.BlockExpr, e: Expr) {
    e.type = rewriteType(st, e.type);
    switch (e.nodeType) {
        case NodeType.BooleanLiteral:
        case NodeType.StringLiteral:
        case NodeType.NumberLiteral: {
            break;
        }
        case NodeType.IDExpr: {
            const x = e as A.IDExpr;
            const v = st.getVar(x.id)!;
            v.type = rewriteType(st, v.type);
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
            x.args.forEach(a => doExpr(st, block, a));
            break;
        }
        case NodeType.ArrayConstructor: {
            const x = e as A.ArrayConstructor;
            if (x.args) x.args.forEach(y => doExpr(st, block, y));
            break;
        }
        case NodeType.TypeInstance: {
            const x = e as A.TypeInstance;
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
            const xx = e as A.ReferenceExpr;
            doExpr(st, block, xx.expr);
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
        default: Errors.raiseDebug(NodeType[e.nodeType]);
    }
}

function rewriteVar(st: SymbolTable, block: A.BlockExpr, v: P.Variable) {
    const s = st.getStruct(v.type.id);
    if (!s)  {
        v.type = rewriteType(st, v.type);
    }
    else {
        s.members.forEach((a: P.Variable) => rewriteVar(st, block, a));
    }
}

function doStmt(st: SymbolTable, block: A.BlockExpr, s: Stmt) {
    switch (s.nodeType) {
        case NodeType.VarInitStmt: {
            const x = s as A.VarInitStmt;
            const v = st.getVar(x.var.id)!;
            rewriteVar(st, block, v);
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
            st = x.tag;

            if (x.init) doStmt(st, block, x.init);
            if (x.update) doStmt(st, block, x.update);
            doBlock(x.body.tag, x.body);
            break;
        }
        default: Errors.raiseDebug(NodeType[s.nodeType]);
    }
}

function doBlock(st: SymbolTable, block: A.BlockExpr) {
    st = block.tag;
    block.xs.forEach(y => doStmt(st, block, y));
    return st;
}

function doFunctionReturnType(st: SymbolTable, fp: P.FunctionPrototype) {

}

function doFunctionPrototype(st: SymbolTable, fp: P.FunctionPrototype) {

}

function doFunction(st: SymbolTable, f: P.Function) {
    st = f.tag;
    doFunctionPrototype(st, f);
    doBlock(st, f.body);
}

function doForeignFunction(st: SymbolTable, f: P.ForeignFunction) {
    st = f.tag;
    doFunctionPrototype(st, f);
}

function doStruct(st: SymbolTable, s: P.Struct) {

}

function doTypeDeclaration(st: SymbolTable, t: P.TypeDeclaration) {

}

function doTypeDefinition(st: SymbolTable, t: P.TypeDefinition) {
    if ((t as P.TypeAlias).alias) {
        const x = t as P.TypeAlias;
    }
    else if ((t as P.TypeDeclaration).cons) {
        const x = t as P.TypeDeclaration;
        doTypeDeclaration(st, x);
    }
    else {
        Errors.raiseDebug();
    }
}

function doModule(st: SymbolTable, m: P.Module) {
    Logger.info(`Type rewriting: ${m.path}`);

    m.structs.forEach(x => doStruct(st, x));
    m.types.forEach(x => doTypeDefinition(st, x));

    for (const x of m.foreignFunctions) {
        doForeignFunction(st, x);
    }

    for (const x of m.functions) {
        doFunction(st, x);
    }

    // check return types
    for (const x of m.foreignFunctions) {
        doFunctionReturnType(st, x);
    }

    for (const x of m.functions) {
        doFunctionReturnType(st, x);
    }
}

export default function rewrite(global: SymbolTable, mods: P.Module[]) {
    for (const m of mods) {
        doModule(m.tag, m);
    }
}
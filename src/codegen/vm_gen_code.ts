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
    ByteBuffer,
    VmCodeBuilder
} from "../vm/mod.ts";
import {
    Errors,
    Logger,
} from "../util/mod.ts";
import {Allocator, Store} from "./Store.ts";
const NodeType = A.NodeType;
type Expr = A.Expr;
type Stmt = A.Stmt;


function derefer(b: VmCodeBuilder, store: Store, r: Store) {
    if (store.isWrite) {
        if (store.isValue) {
            store.write_deref(b, r);
        }
        else {
            store.write_reg(b, r);
        }
    }
    else {
        if (store.isRHS) {
            if (store.isValue) {
                r.write_deref(b, store);
            }
            else {
                r.write_reg(b, store);
            }
        }
        else {
            if (store.isValue) {
                r.write_reg_to_deref(b, store);
            }
            else {
                r.write_reg(b, store);
            }
        }
    }
}

function _emitExpr(b: VmCodeBuilder, ac: Allocator, store: Store, e: Expr, isIfStmt: boolean) {
    switch (e.nodeType) {
        case NodeType.BooleanLiteral: {
            const x = e as A.BooleanLiteral;
            store.write_imm(b,x.value ? 1 : 0);
            break;
        }
        case NodeType.StringLiteral: {
            const x = e as A.StringLiteral;
            store.write_str(b, x.value);
            break;
        }
        case NodeType.NumberLiteral: {
            const x = e as A.NumberLiteral;
            store.write_imm(b,Number(x.value));
            break;
        }
        case NodeType.BinaryExpr: {
            const x = e as A.BinaryExpr;

            const t1 = ac.tmp();
            const t2 = ac.tmp();
            emitExpr(b, ac, t1, x.left, isIfStmt);
            emitExpr(b, ac, t2, x.right, isIfStmt);

            switch (x.op) {
                case "*": {
                    b.mul_r_r(t1.reg, t2.reg);
                    break;
                }
                case "/": {
                    b.div_r_r(t1.reg, t2.reg);
                    break;
                }
                case "%": {
                    b.mod_r_r(t1.reg, t2.reg);
                    break;
                }
                case "+": {
                    b.add_r_r(t1.reg, t2.reg);
                    break;
                }
                case "-": {
                    b.sub_r_r(t1.reg, t2.reg);
                    break;
                }
                case "==": {
                    b.cmp_r_r(t1.reg, t2.reg);
                    b.sete(t1.reg);
                    break;
                }
                case "!=": {
                    b.cmp_r_r(t1.reg, t2.reg);
                    b.setne(t1.reg);
                    break;
                }
                case "&": {
                    b.and_r_r(t1.reg, t2.reg);
                    break;
                }
                case "|": {
                    b.or_r_r(t1.reg, t2.reg);
                    break;
                }
                case "<": {
                    b.cmp_r_r(t1.reg, t2.reg);
                    b.setlt(t1.reg);
                    break;
                }
                case ">": {
                    b.cmp_r_r(t1.reg, t2.reg);
                    b.setgt(t1.reg);
                    break;
                }
                case "<=": {
                    b.cmp_r_r(t1.reg, t2.reg);
                    b.setle(t1.reg);
                    break;
                }
                case ">=": {
                    b.cmp_r_r(t1.reg, t2.reg);
                    b.setge(t1.reg);
                    break;
                }
                default: Errors.raiseDebug(x.op);
            }

            store.write_reg(b, t1);
            t1.free();
            t2.free();
            break;
        }
        case NodeType.FunctionApplication: {
            const x = e as A.FunctionApplication;

            // push used regs to stack
            const saved = ac.save(b);

            // put args in  r0 ... rN
            for (let i = 0; i < x.args.length; i += 1) {
                const r = ac.from(`r${i}`);
                emitExpr(b, ac, r, x.args[i], isIfStmt);
            }
            b.call(x.id);

            // pop used regs from stack
            ac.restore(b, saved);

            store.write_reg(b, ac.from("r0"));
            break;
        }
        case NodeType.ArrayConstructor: {
            const x = e as A.ArrayConstructor;

            const args = x.args!;
            const n = args.length;
            const step = 8;
            const bb = ByteBuffer.build(8 + 8 + (step * 8));
            bb.write_u64(n);
            bb.write_u64(step);
            for (let i = 0; i < args.length*8; i += 1) {
                bb.write_u8(0xCC);
            }
            const offset = b.heapStore(bb.asBytes());

            const tmp = ac.tmp();
            let hp = offset + 8 + 8;
            for (let i = 0; i < args.length; i += 1) {
                emitExpr(b, ac, tmp, args[i], isIfStmt);
                b.mov_m_r(hp, tmp.reg);
                hp += 8;
            }
            tmp.free();

            store.write_imm(b, offset);
            break;
        }
        case NodeType.DereferenceExpr: {
            const x = e as A.DereferenceExpr;

            const r = ac.tmp();
            _emitExpr(b, ac, r, x.expr, isIfStmt);
            derefer(b, store, r);
            r.free();
            break;
        }
        case NodeType.IDExpr: {
            const x = e as A.IDExpr;
            const ids = ac.get(x.id);

            if (store.isWrite) {
                store.write_reg(b, ids);
            }
            else {
                ids.write_reg(b, store);
            }
            break;
        }
        case NodeType.ArrayExpr: {
            const x = e as A.ArrayExpr;

            const index = ac.tmp();
            emitExpr(b, ac, index, x.args[0], isIfStmt);

            // get element size offset
            const t1 = ac.tmp();
            t1.write_reg(b, ac.get(x.id));
            b.add_r_i(t1.reg, 8);

            const t2 = ac.tmp();
            b.mov_r_ro(t2.reg, t1.reg);
            b.mul_r_r(t2.reg, index.reg);

            b.add_r_i(t2.reg, 8);
            b.add_r_r(t2.reg, t1.reg);

            derefer(b, store, t2);

            index.free();
            t1.free();
            t2.free();
            break;
        }
        case NodeType.ReturnExpr: {
            const x = e as A.ReturnExpr;
            if (isIfStmt) {
                emitExpr(b, ac, ac.from("r0"), x.expr, isIfStmt);
                b.ret();
            }
            else {
                emitExpr(b, ac, store, x.expr, isIfStmt);
            }
            break;
        }
        case NodeType.IfExpr: {
            const x = e as A.IfExpr;

            const r = ac.tmp();
            emitExpr(b, ac, r, x.condition, isIfStmt);
            b.cmp_r_i(r.reg, 1);
            r.free();

            const gotoElse = `else-${b.codeOffset()}`;
            b.jnz(gotoElse);

            x.ifBranch.forEach(x => emitStmt(b, ac, x, isIfStmt));
            const gotoEnd = `end-${b.codeOffset()}`;
            b.jmp(gotoEnd);

            const elseOffset = b.codeOffset();
            x.elseBranch.forEach(x => emitStmt(b, ac, x, isIfStmt));
            const endOffset = b.codeOffset();

            b.mapCodeOffset(gotoElse, elseOffset);
            b.mapCodeOffset(gotoEnd, endOffset);
            break;
        }
        case NodeType.CastExpr: {
            const x = e as A.CastExpr;
            emitExpr(b, ac, store, x.expr, isIfStmt);
            break;
        }
        case NodeType.ReferenceExpr: {
            const x = e as A.ReferenceExpr;
            const old = store.isValue;
            store.isValue = false;
            emitExpr(b, ac, store, x.expr, isIfStmt);
            store.isValue = old;
            break;
        }
        case NodeType.LExpr: {
            const x = e as A.LExpr;
            emitExpr(b, ac, store, x, isIfStmt);
            break;
        }
        case NodeType.RExpr: {
            const x = e as A.RExpr;
            emitExpr(b, ac, store, x, isIfStmt);
            break;
        }
        default: Errors.raiseDebug(NodeType[e.nodeType]);
    }
}

function emitExpr(b: VmCodeBuilder, ac: Allocator, store: Store, e: Expr, isIfStmt: boolean) {
    switch (e.nodeType) {
        case NodeType.LExpr: {
            const x = e as A.LExpr;
            _emitExpr(b, ac, store, x.expr, isIfStmt);
            break;
        }
        case NodeType.RExpr: {
            const x = e as A.RExpr;
            _emitExpr(b, ac, store, x.expr, isIfStmt);
            break;
        }
        default: Errors.raiseDebug(NodeType[e.nodeType]);
    }
}

function emitStmt(b: VmCodeBuilder, ac: Allocator, s: Stmt, isIfStmt: boolean) {
    Logger.debug("##===========##");
    Errors.debug();
    switch (s.nodeType) {
        case NodeType.VarInitStmt: {
            const x = s as A.VarInitStmt;
            const store = ac.alloc(x.var);
            emitExpr(b, ac, store, x.expr, isIfStmt);
            break;
        }
        case NodeType.VarAssnStmt: {
            const x = s as A.VarAssnStmt;
            const r = ac.tmp();
            r.isRHS = true;
            emitExpr(b, ac, r, x.rhs, isIfStmt);
            r.isWrite = false;
            r.isRHS = false;
            emitExpr(b, ac, r, x.lhs, isIfStmt);
            r.free();
            break;
        }
        case NodeType.ExprStmt: {
            const x = s as A.ExprStmt;
            const isIfStmt = x.expr.expr.nodeType === NodeType.IfExpr;
            const r = ac.from("r0");
            emitExpr(b, ac, r, x.expr, isIfStmt);
            break;
        }
        case NodeType.ForStmt: {
            const x = s as A.ForStmt;

            if (x.init) emitStmt(b, ac, x.init, isIfStmt);

            const startOffset = b.codeOffset();
            const gotoStart = `start-${startOffset}`;
            let gotoEnd = ";"

            if (x.condition) {
                const r = ac.tmp();
                emitExpr(b, ac, r, x.condition, isIfStmt);
                b.cmp_r_i(r.reg, 1);
                gotoEnd = `end-${b.codeOffset()}`;
                b.jnz(gotoEnd);
                r.free();
            }

            x.body.forEach(x => emitStmt(b, ac, x, isIfStmt));
            if (x.update) emitStmt(b, ac, x.update, isIfStmt);
            b.jmp(gotoStart);
            const endOffset = b.codeOffset();

            b.mapCodeOffset(gotoStart, startOffset);
            if (gotoEnd) b.mapCodeOffset(gotoEnd, endOffset);

            break;
        }
        default: Errors.raiseDebug(NodeType[s.nodeType]);
    }
}

function emitFunction(b: VmCodeBuilder, f: P.Function) {
    b.startFunction(f.proto.id);
    const ac = Allocator.build();
    const scratch = ac.tmp();
    if (scratch.reg !== "r0") Errors.raiseDebug();
    f.proto.params.forEach(x => ac.alloc(x));
    f.body.forEach(x => emitStmt(b, ac, x, false));
    b.ret();
}

export default function vm_gen_code(m: P.Module) {
    const b = VmCodeBuilder.build();

    m.foreignFunctions.forEach(x => b.addForeignFunction(x.proto.id));

    // first, main
    const main = m.functions.filter(x => x.proto.id === "main")[0];
    emitFunction(b, main);

    // then, rest
    const xs = m.functions.filter(x => x.proto.id !== "main");
    xs.forEach(x => emitFunction(b, x));

    return b;
}
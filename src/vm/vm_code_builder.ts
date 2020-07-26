/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    Dictionary,
    Errors,
    Logger,
} from "../util/mod.ts";

import {
    VmOperation,
} from "./mod.internal.ts";
import {
    registers,
} from "./mod.ts";
import Vm from "./vm.ts";

export class ByteBuffer {
    private readonly enc: TextEncoder;
    private readonly xs: Uint8Array;
    private readonly dv: DataView;
    private _offset: number;

    private constructor(size: number) {
        this.enc = new TextEncoder();
        this.xs = new Uint8Array(size);
        this.dv = new DataView(this.xs.buffer);
        this._offset = 0;
    }

    static build(size: number) {
        return new ByteBuffer(size);
    }

    offset() {
        return this._offset;
    }

    write_str(x: string) {
        const xs = this.enc.encode(x);
        this.write_u64(xs.length);
        for (let i = 0; i < xs.length; i += 1) {
            this.dv.setUint8(this._offset, xs[i]);
            this._offset += 1;
        }
        return xs.length;
    }

    write_u8(x: number) {
        if (x > 255) Errors.raiseDebug();
        this.dv.setUint8(this._offset, x);
        this._offset += 1;
        return 1;
    }

    write_u64(x: number) {
        const n = this.write_u64_at(x, this._offset);
        this._offset += 8;
        return n;
    }

    write_u64_at(x: number, offset: number) {
        this.dv.setBigUint64(offset, BigInt(x));
        return 8;
    }

    write(xs: Uint8Array) {
        for (let i = 0; i < xs.length; i += 1) {
            this.dv.setUint8(this._offset, xs[i]);
            this._offset += 1;
        }
    }

    asBytes() {
        return this.xs;
    }
}

interface Reloc {
    offset: number;
    id: string;
}

function write_r_r(bb: ByteBuffer, rd: string, rs: string, op: VmOperation) {
    bb.write_u8(op);
    const a = registers[rd];
    const b = registers[rs];
    bb.write_u8(a << 4 | b);
}

function write_r_i(bb: ByteBuffer, rd: string, n: number, op: VmOperation) {
    bb.write_u8(op);
    const a = registers[rd];
    bb.write_u8(a << 4 | 0);
    bb.write_u64(n);
}

function write_r(bb: ByteBuffer, rd: string, op: VmOperation) {
    bb.write_u8(op);
    const a = registers[rd];
    bb.write_u8(a << 4 | 0);
}

export class VmCodeBuilder {
    private static readonly SEGMENT_SIZE = Vm.SEGMENT_SIZE;
    private static readonly CS_BASE = 0;
    private static readonly DS_BASE = VmCodeBuilder.SEGMENT_SIZE;
    private static readonly RDS_BASE = VmCodeBuilder.SEGMENT_SIZE*2;

    private readonly cs: ByteBuffer
    private readonly ds: ByteBuffer;
    private readonly rds: ByteBuffer;
    private readonly functions: Dictionary<number>;
    private readonly reloc: Array<Reloc>;

    private constructor() {
        this.cs = ByteBuffer.build(VmCodeBuilder.SEGMENT_SIZE);
        this.ds = ByteBuffer.build(VmCodeBuilder.SEGMENT_SIZE);
        this.rds = ByteBuffer.build(VmCodeBuilder.SEGMENT_SIZE);
        this.functions = {};
        this.reloc = [];

        for (let i = 0; i < Vm.IVT_END; i += 1) {
            this.cs.write_u8(0xEE);
        }
    }

    static build() {
        return new VmCodeBuilder();
    }

    addForeignFunction(id: string, idx: number) {
        this.functions[id] = idx * 8;
        Logger.debug(`addForeignFunction:: ${id} => ${this.functions[id]}`);
    }

    startFunction(id: string) {
        while ((this.cs.offset() % Vm.IVT_END) !== 0) {
            this.cs.write_u8(0xCC);
        }
        this.functions[id] = this.cs.offset();
        Logger.debug(`startFunction:: ${id} => ${this.functions[id]}`);
    }

    private putStr(x: string) {
        const offs = this.rds.offset();
        return [VmCodeBuilder.RDS_BASE + offs, this.rds.write_str(x)];
    }

    heapStore(xs: Uint8Array) {
        const offs = this.ds.offset();
        this.ds.write(xs);
        return VmCodeBuilder.DS_BASE+offs;
    }

    mov_r_r(rd: string, rs: string) {
        if (rd === rs) return;
        this.cs.write_u8(VmOperation.MOV_R_R);
        const a = registers[rd];
        const b = registers[rs];
        this.cs.write_u8(a << 4 | b);
    }

    mov_r_i(rd: string, n: number) {
        this.cs.write_u8(VmOperation.MOV_R_I);
        const a = registers[rd];
        this.cs.write_u8(a << 4 | 0);
        this.cs.write_u64(n);
    }

    mov_r_str(rd: string, x: string) {
        const [offset, size] = this.putStr(x);
        this.mov_r_i(rd, offset);
    }

    mov_m_r(offset: number, rd: string) {
        this.cs.write_u8(VmOperation.MOV_M_R);
        const a = registers[rd];
        this.cs.write_u8(a << 4 | 0);
        this.cs.write_u64(offset);
    }

    mov_r_m(rd: string, offset: number) {
        this.cs.write_u8(VmOperation.MOV_R_M);
        const a = registers[rd];
        this.cs.write_u8(a << 4 | 0);
        this.cs.write_u64(offset);
    }

    mov_r_ro(rd: string, rs: string) {
        this.cs.write_u8(VmOperation.MOV_R_RO);
        const a = registers[rd];
        const b = registers[rs];
        this.cs.write_u8(a << 4 | b);
    }

    push_i(x: number) {
        this.cs.write_u8(VmOperation.PUSH_I);
        this.cs.write_u64(x);
    }

    push_r(r: string) {
        this.cs.write_u8(VmOperation.PUSH);
        const a = registers[r];
        this.cs.write_u8(a << 4 | 0);
    }

    pop_r(r: string) {
        this.cs.write_u8(VmOperation.POP);
        const a = registers[r];
        this.cs.write_u8(a << 4 | 0);
    }

    call(id: string) {
        this.cs.write_u8(VmOperation.CALL);
        let offset;
        Logger.debug(`call:: ${id} => ${this.functions[id]}`);
        if (this.functions[id] !== undefined) {
            offset = this.functions[id]; // location of function
        }
        else {
            this.reloc.push({
                id: id,
                offset: this.cs.offset(),
            });
            offset = 0xFFFFFFFFFFFFFFFF;
        }
        this.cs.write_u64(offset);
    }

    ret() {
        this.cs.write_u8(VmOperation.RET);
    }

    mul_r_r(rd: string, rs: string) {
        write_r_r(this.cs, rd, rs, VmOperation.MUL_R_R);
    }

    div_r_r(rd: string, rs: string) {
        write_r_r(this.cs, rd, rs, VmOperation.DIV_R_R);
    }

    mod_r_r(rd: string, rs: string) {
        write_r_r(this.cs, rd, rs, VmOperation.MOD_R_R);
    }

    add_r_r(rd: string, rs: string) {
        write_r_r(this.cs, rd, rs, VmOperation.ADD_R_R);
    }

    sub_r_r(rd: string, rs: string) {
        write_r_r(this.cs, rd, rs, VmOperation.SUB_R_R);
    }

    mul_r_i(rd: string, n: number) {
        write_r_i(this.cs, rd, n, VmOperation.MUL_R_I);
    }

    div_r_i(rd: string, n: number) {
        write_r_i(this.cs, rd, n, VmOperation.DIV_R_I);
    }

    mod_r_i(rd: string, n: number) {
        write_r_i(this.cs, rd, n, VmOperation.MOD_R_I);
    }

    add_r_i(rd: string, n: number) {
        write_r_i(this.cs, rd, n, VmOperation.ADD_R_I);
    }

    sub_r_i(rd: string, n: number) {
        write_r_i(this.cs, rd, n, VmOperation.SUB_R_I);
    }

    cmp_r_r(rd: string, rs: string) {
        write_r_r(this.cs, rd, rs, VmOperation.CMP_R_R);
    }

    and_r_r(rd: string, rs: string) {
        write_r_r(this.cs, rd, rs, VmOperation.AND_R_R);
    }

    or_r_r(rd: string, rs: string) {
        write_r_r(this.cs, rd, rs, VmOperation.OR_R_R);
    }

    not(rd: string) {
        write_r(this.cs, rd, VmOperation.NOT);
    }

    asBytes() {
        // finalize reloc
        for (const r of this.reloc) {
            const offset = this.functions[r.id];
            const dest = r.offset;
            this.cs.write_u64_at(offset, dest);
        }

        const xs = new Uint8Array(VmCodeBuilder.SEGMENT_SIZE * 3);
        xs.set(this.cs.asBytes(), 0);
        xs.set(this.ds.asBytes(), VmCodeBuilder.SEGMENT_SIZE);
        xs.set(this.rds.asBytes(), VmCodeBuilder.SEGMENT_SIZE * 2);
        return xs;
    }
}
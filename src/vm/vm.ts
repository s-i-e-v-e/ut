/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
    Errors,
    Logger
} from "../util/mod.ts";
import {
    VmOperation
} from "./mod.internal.ts";
import {
    FFI
} from "./mod.ts";

function read_u64_from_ptr(dv: DataView, p: bigint) {
    const upper = BigInt(dv.getUint32(Number(p)));
    const lower = BigInt(dv.getUint32(Number(p + 4n)));

    return (upper * (2n ** 32n)) + lower;
}

export default class Vm {
    public static readonly SEGMENT_SIZE = 1024;
    public static readonly IVT_END = 128;
    private ip: bigint;
    private hp: bigint; // heap pointer
    private sp: bigint; // stack pointer
    private readonly registers = [
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n,
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n,
    ];
    private readonly memory: Uint8Array;
    private readonly dv: DataView;
    private readonly dec: TextDecoder;

    private constructor() {
        this.memory = new Uint8Array(Vm.SEGMENT_SIZE*8);
        this.dv = new DataView(this.memory.buffer);
        this.dec = new TextDecoder();
        this.ip = BigInt(Vm.IVT_END);
        this.hp = BigInt(Vm.SEGMENT_SIZE*3);
        this.sp = BigInt(this.memory.length - 8);
    }

    static build() {
        return new Vm;
    }

    private read_u8() {
        const x = this.dv.getUint8(Number(this.ip));
        this.ip += 1n;
        return x;
    }

    private read_u64(offset?: bigint) {
        if (offset) {
            return read_u64_from_ptr(this.dv, offset);
        }
        else {
            const x = read_u64_from_ptr(this.dv, this.ip);
            this.ip += 8n;
            return x;
        }
    }

    private read_str(offset: bigint) {
        let ip = offset;

        const len = this.read_u64(ip);
        ip += 8n;
        const xs = [];
        for (let i = 0; i < len; i += 1) {
            const x = this.dv.getUint8(Number(ip));
            xs.push(x);
            ip += 1n;
        }

        return this.dec.decode(new Uint8Array(xs));
    }

    private write_u64(offset: bigint, x: bigint) {
        this.dv.setBigUint64(Number(offset), BigInt(x));
    }

    private push(n: bigint) {
        this.dv.setBigUint64(Number(this.sp), n);
        this.sp -= 8n;
    }

    private pop() {
        this.sp += 8n;
        return read_u64_from_ptr(this.dv, this.sp);
    }

    private init(code: Uint8Array) {
        if (code.length >= this.memory.length) Errors.raiseDebug();

        for (let i = 0; i < code.length; i += 1) {
            this.memory[i] = code[i];
        }
    }

    private parse_r_r(ins?: string) {
        const rr = this.read_u8();
        const rd = (rr >>> 4) & 0x0F;
        const rs = rr & 0x0F;
        if (ins) Logger.debug(`${ins} r${rd}, r${rs}`);
        return [rd, rs];
    }

    private parse_r_i() {
        const rr = this.read_u8();
        const r = (rr >>> 4) & 0x0F;
        const x = this.read_u64();
        return [BigInt(r), x];
    }

    exec(code: Uint8Array) {
        this.init(code);

        this.push(0n);

        while (true) {
            const ins = this.read_u8();
            switch (ins) {
                case VmOperation.ADD_R_R: {
                    const [rd, rs] = this.parse_r_r("ADD");
                    this.registers[Number(rd)] += this.registers[rs];
                    break;
                }
                case VmOperation.ADD_R_I: {
                    const [rd, x] = this.parse_r_i();
                    this.registers[Number(rd)] += x;
                    Logger.debug(`ADD r${rd}, ${x}`);
                    break;
                }
                case VmOperation.SUB_R_R: {
                    const [rd, rs] = this.parse_r_r("SUB");
                    this.registers[Number(rd)] -= this.registers[rs];
                    break;
                }
                case VmOperation.SUB_R_I: {
                    const [rd, x] = this.parse_r_i();
                    this.registers[Number(rd)] -= x;
                    Logger.debug(`SUB r${rd}, ${x}`);
                    break;
                }
                case VmOperation.MUL_R_R: {
                    const [rd, rs] = this.parse_r_r("MUL");
                    this.registers[Number(rd)] *= this.registers[rs];
                    break;
                }
                case VmOperation.MUL_R_I: {
                    const [rd, x] = this.parse_r_i();
                    this.registers[Number(rd)] *= x;
                    Logger.debug(`MUL r${rd}, ${x}`);
                    break;
                }
                case VmOperation.DIV_R_R: {
                    const [rd, rs] = this.parse_r_r("DIV");
                    this.registers[Number(rd)] /= this.registers[rs];
                    break;
                }
                case VmOperation.DIV_R_I: {
                    const [rd, x] = this.parse_r_i();
                    this.registers[Number(rd)] /= x;
                    Logger.debug(`DIV r${rd}, ${x}`);
                    break;
                }
                case VmOperation.MOD_R_R: {
                    const [rd, rs] = this.parse_r_r("MOD");
                    this.registers[Number(rd)] %= this.registers[rs];
                    break;
                }
                case VmOperation.MOD_R_I: {
                    const [rd, x] = this.parse_r_i();
                    this.registers[Number(rd)] %= x;
                    Logger.debug(`MOD r${rd}, ${x}`);
                    break;
                }
                case VmOperation.MOV_R_R: {
                    const [rd, rs] = this.parse_r_r("MOV");
                    this.registers[Number(rd)] = this.registers[rs];
                    break;
                }
                case VmOperation.MOV_R_I: {
                    const [rd, x] = this.parse_r_i();
                    this.registers[Number(rd)] = x;
                    Logger.debug(`MOV r${rd}, ${x}`);
                    break;
                }
                case VmOperation.MOV_R_RO: {
                    const [rd, rs] = this.parse_r_r();
                    const offset = this.registers[rs];
                    this.registers[Number(rd)] = this.read_u64(offset);
                    Logger.debug(`MOV r${rd}, [r${rs}] // [${offset}]`);
                    break;
                }
                case VmOperation.MOV_R_M: {
                    const [rd, offset] = this.parse_r_i();
                    this.registers[Number(rd)] = this.read_u64(offset);
                    Logger.debug(`MOV r${rd}, [${offset}]`);
                    break;
                }
                case VmOperation.MOV_M_R: {
                    const [rs, offset] = this.parse_r_i();
                    this.write_u64(offset, this.registers[Number(rs)]);
                    Logger.debug(`MOV [${offset}], r${rs}`);
                    break;
                }
                case VmOperation.CMP_R_R: {
                    const [rd, rs] = this.parse_r_r("CMP");
                    this.registers[Number(rd)] = this.registers[Number(rd)] === this.registers[rs] ? 1n : 0n;
                    break;
                }
                case VmOperation.AND_R_R: {
                    const [rd, rs] = this.parse_r_r("AND");
                    this.registers[Number(rd)] = this.registers[Number(rd)] && this.registers[rs];
                    break;
                }
                case VmOperation.OR_R_R: {
                    const [rd, rs] = this.parse_r_r("OR");
                    this.registers[Number(rd)] = this.registers[Number(rd)] || this.registers[rs];
                    break;
                }
                case VmOperation.PUSH: {
                    const rr = this.read_u8();
                    const rs = (rr >>> 4) & 0x0F;
                    Logger.debug(`PUSH r${rs}`);
                    this.push(this.registers[rs]);
                    break;
                }
                case VmOperation.POP: {
                    const rr = this.read_u8();
                    const rd = (rr >>> 4) & 0x0F;
                    Logger.debug(`POP r${rd}`);
                    this.registers[rd] = this.pop();
                    break;
                }
                case VmOperation.CALL: {
                    const offset = this.read_u64();
                    Logger.debug(`CALL ${offset}`);
                    if (offset < Vm.IVT_END) {
                        switch (Number(offset)/8) {
                            case FFI.Sys_exit: {
                                Deno.exit(Number(this.registers[0]));
                                break;
                            }
                            case FFI.Sys_println: {
                                const str = this.read_str(this.registers[0]);
                                console.log(str);
                                break;
                            }
                            case FFI.Sys_u64_println: {
                                console.log(`${this.registers[0]}`);
                                break;
                            }
                            case FFI.Sys_bool_println: {
                                console.log(`${this.registers[0] === 1n}`);
                                break;
                            }
                            default: Errors.raiseDebug();
                        }
                    }
                    else {
                        this.push(this.ip);
                        this.ip = offset;
                    }
                    break;
                }
                case VmOperation.RET: {
                    Logger.debug("RET");
                    this.ip = this.pop();
                    if (this.ip === 0n) {
                        Logger.debug("DONE");
                        return;
                    }
                    break;
                }
                default: Errors.raiseDebug(""+ins);
            }
        }
    }
}
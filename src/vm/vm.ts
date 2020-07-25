/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {Errors, Logger} from "../util/mod.ts";
import { VmOperation } from "./mod.internal.ts";
import {FFI} from "./mod.ts";

function read_u64_from_ptr(dv: DataView, p: number) {
    const upper = dv.getUint32(p);
    const lower = dv.getUint32(p + 4);

    return (upper * (2 ** 32)) + lower;
}

export default class Vm {
    public static readonly SEGMENT_SIZE = 1024;
    public static readonly IVT_END = 128;
    private ip: number;
    private hp: number; // heap pointer
    private sp: number; // stack pointer
    private readonly registers = [
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
    ];
    private readonly memory: Uint8Array;
    private readonly dv: DataView;
    private readonly dec: TextDecoder;

    private constructor() {
        this.memory = new Uint8Array(Vm.SEGMENT_SIZE*8);
        this.dv = new DataView(this.memory.buffer);
        this.dec = new TextDecoder();
        this.ip = Vm.IVT_END;
        this.hp = Vm.SEGMENT_SIZE*3;
        this.sp = this.memory.length - 8;
    }

    static build() {
        return new Vm;
    }

    private read_u8() {
        const x = this.dv.getUint8(this.ip);
        this.ip += 1;
        return x;
    }

    private read_u64(offset?: number) {
        if (offset) {
            return read_u64_from_ptr(this.dv, offset);
        }
        else {
            const x = read_u64_from_ptr(this.dv, this.ip);
            this.ip += 8;
            return x;
        }
    }

    private read_str(offset: number) {
        let ip = offset;

        const len = this.read_u64(ip);
        ip += 8;
        const xs = [];
        for (let i = 0; i < len; i += 1) {
            const x = this.dv.getUint8(ip);
            xs.push(x);
            ip += 1;
        }

        return this.dec.decode(new Uint8Array(xs));
    }

    private write_u64(offset: number, x: number) {
        this.dv.setBigUint64(offset, BigInt(x));
    }

    private push(n: number) {
        this.dv.setBigUint64(this.sp, BigInt(n));
        this.sp -= 8;
    }

    private pop() {
        this.sp += 8;
        return read_u64_from_ptr(this.dv, this.sp);
    }

    private init(code: Uint8Array) {
        if (code.length >= this.memory.length) Errors.raiseDebug();

        for (let i = 0; i < code.length; i += 1) {
            this.memory[i] = code[i];
        }
    }

    exec(code: Uint8Array) {
        this.init(code);

        this.push(0);

        while (true) {
            const ins = this.read_u8();
            switch (ins) {
                case VmOperation.MOV_R_R: {
                    const rr = this.read_u8();
                    const rd = (rr >>> 4) & 0x0F;
                    const rs = rr & 0x0F;
                    Logger.debug(`MOV r${rd}, r${rs}`);
                    this.registers[rd] = this.registers[rs];
                    break;
                }
                case VmOperation.MOV_R_I: {
                    const rr = this.read_u8();
                    const rd = (rr >>> 4) & 0x0F;
                    const x = this.read_u64();
                    Logger.debug(`MOV r${rd}, ${x}`);
                    this.registers[rd] = x;
                    break;
                }
                case VmOperation.MOV_R_M: {
                    const rr = this.read_u8();
                    const rd = (rr >>> 4) & 0x0F;
                    const offset = this.read_u64();
                    Logger.debug(`MOV r${rd}, [${offset}]`);
                    this.registers[rd] = this.read_u64(offset);
                    break;
                }
                case VmOperation.MOV_M_R: {
                    const rr = this.read_u8();
                    const rd = (rr >>> 4) & 0x0F;
                    const offset = this.read_u64();
                    Logger.debug(`MOV [${offset}], r${rd}`);
                    this.write_u64(offset, this.registers[rd]);
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
                        switch (offset/8) {
                            case FFI.Sys_exit: {
                                Deno.exit(this.registers[0]);
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
                    if (this.ip === 0) {
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
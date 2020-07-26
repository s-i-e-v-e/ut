/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { OS } from "./mod.ts";

export enum LogLevel {
    NONE,
    INFO,
    DEBUG,
}

export class Logger {
    private static level = LogLevel.NONE;

    static setLevel(level: LogLevel) {
        this.level = level;
    }

    static info(msg: string) {
        if (this.level < LogLevel.INFO) return;
        console.log(msg);
    }

    static error(e: Error) {
        return OS.panic(e.message);
    }

    static debug(msg: string) {
        if (this.level < LogLevel.DEBUG) return;
        console.log(msg);
    }

    static printLevel() {
        const x = `Will print info: ${!(this.level < LogLevel.INFO)}.`;
        const y = `Will print debug: ${!(this.level < LogLevel.DEBUG)}.`;

        switch (this.level) {
            case LogLevel.INFO: console.log(`INFO. ${x} ${y}`); break;
            case LogLevel.DEBUG: console.log(`DEBUG. ${x} ${y}`); break;
            case LogLevel.NONE:
            default: {
                console.log(`NONE. ${x} ${y}`);
                break;
            }
        }
    }
}
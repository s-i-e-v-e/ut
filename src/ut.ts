/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { run, Config,  }from "./runner.ts";
import {
    Logger,
    LogLevel,
    OS,
    Errors,
} from "./util/mod.ts";

function help() {
    console.log("ut 0.1");
    console.log("USAGE:");
    console.log("   ut run <file>");
    console.log("   ut help");
}

interface Command {
    id: string,
    args: string[],
}

async function main(args: string[]) {
    const cfg: Config = {
        logLevel: LogLevel.NONE,
        dump: false,
    };

    let cx: Command = {
        id: "",
        args: []
    };
    for (let i = 0; i < args.length;) {
        const cmd = args[i];
        i += 1;

        switch (cmd) {
            case "-v": {
                cfg.logLevel = LogLevel.INFO;
                break;
            }
            case "-vv": {
                cfg.logLevel = LogLevel.DEBUG0;
                break;
            }
            case "-vvv": {
                cfg.logLevel = LogLevel.DEBUG1;
                break;
            }
            case "-vvvv": {
                cfg.logLevel = LogLevel.DEBUG2;
                break;
            }
            case "-d": {
                cfg.dump = true;
                break;
            }
            case "help": {
                cx = {
                    id: cmd,
                    args: [],
                };
                break;
            }
            case "run": {
                const a = args[i];
                i += 1;
                cx = {
                    id: cmd,
                    args: [a],
                };
                break;
            }
            default: {
                OS.panic(`Unknown command: ${cmd}`);
                break;
            }
        }
    }

    Logger.setLevel(cfg.logLevel);
    switch (cx.id) {
        case undefined:
        case "":
        case "help": {
            help();
            break;
        }
        case "run": await run(cx.args[0], cfg); break;
        default: Errors.raiseDebug();
    }
}

await main(Deno.args);
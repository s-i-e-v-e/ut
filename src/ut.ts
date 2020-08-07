/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    Command,
    Config,
    Logger,
    OS,
    Errors,
} from "./util/mod.ts";
import { run }from "./runner.ts";

function help() {
    console.log("ut 0.1");
    console.log("USAGE:");
    console.log("   ut run <file>");
    console.log("   ut help");
}

function parseCommandlineArgs(args: string[]): [Command, Config] {
    const cfg: Config = {
        logLevel: 0,
        dump: false,
        base: ".",
    };

    let cx: Command = {
        id: "",
        args: []
    };

    args = args.slice();
    for (;args.length;) {
        const cmd = args.shift();

        switch (cmd) {
            case "-v": {
                cfg.logLevel += 1;
                break;
            }
            case "-vv": {
                cfg.logLevel += 2;
                break;
            }
            case "-vvv": {
                cfg.logLevel += 3;
                break;
            }
            case "-d": {
                cfg.dump = true;
                break;
            }
            case "-b": {
                cfg.base = args.shift() || "";
                break;
            }
            case "-h":
            case "--help":
            case "help": {
                cx = {
                    id: "help",
                    args: [],
                };
                break;
            }
            case "run": {
                cx = {
                    id: cmd,
                    args: args,
                };
                args = [];
                break;
            }
            default: {
                OS.panic(`Unknown command: ${cmd}`);
                break;
            }
        }
    }
    return [cx, cfg];
}

async function main(args: string[]) {
    let [cx, cfg] = parseCommandlineArgs(args);
    Logger.setLevel(cfg.logLevel);

    switch (cx.id) {
        case undefined:
        case "":
        case "help": {
            help();
            break;
        }
        case "run": await run(cx.args, cfg); break;
        default: Errors.notImplemented(cx.id);
    }
}

await main(Deno.args);
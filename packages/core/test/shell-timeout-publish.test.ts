import { expect } from "bun:test"
import { Effect, Layer, Sink, Stream } from "effect"
import { ChildProcessSpawner } from "effect/process"
import { ExitCode, makeHandle, ProcessId } from "effect/process/ChildProcessSpawner"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { Config } from "@opencode/core/config"
import { Environment } from "@opencode/core/environment/index"
import { Location } from "@opencode/core/location"
import { Shell } from "@opencode/core/shell"
import { Global } from "@opencode/util/global"
import { hostEnvironmentLayer } from "./fixture/environment"
import { tempGlobalLayer } from "./fixture/global"
import { tempLocationLayer } from "./fixture/location"
import { it } from "./lib/effect"

// A spawner that models a D-state child: `exitCode` never resolves and `kill` is a no-op
// (SIGKILL stays pending until the process leaves uninterruptible sleep).
const stuckEnvironment = Layer.effect(
  Environment.Service,
  Effect.gen(function* () {
    const host = yield* Environment.Service
    return Environment.Service.of({
      ...host,
      spawner: ChildProcessSpawner.make(() =>
        Effect.gen(function* () {
          const output = Stream.succeed(Buffer.from("stuck"))
          return makeHandle({
            pid: ProcessId(1),
            exitCode: Effect.never,
            isRunning: Effect.succeed(true),
            kill: () => Effect.succeed(ExitCode(0)).pipe(Effect.asVoid),
            stdin: Sink.drain,
            stdout: output,
            stderr: Stream.empty,
            all: output,
            getInputFd: () => Sink.drain,
            getOutputFd: () => Stream.empty,
            unref: Effect.succeed(Effect.void),
          })
        }),
      ),
    })
  }),
).pipe(Layer.provide(hostEnvironmentLayer))

it.live(
  "a timeout publishes a terminal result when the child never exits (D-state)",
  () =>
    Effect.gen(function* () {
      const shell = yield* Shell.Service
      const info = yield* shell.create({ shell: "sh", command: "stuck", timeout: 500 })
      const result = yield* shell.result(info)
      expect(result.info.status).toBe("timeout")
    }).pipe(
      Effect.provide(
        AppNodeBuilder.build(Shell.node, [
          Location.node.replace(tempLocationLayer),
          Global.node.replace(tempGlobalLayer),
          Config.node.replace(Config.testLayer()),
          Environment.node.replace(stuckEnvironment),
        ]),
      ),
    ),
  30_000,
)

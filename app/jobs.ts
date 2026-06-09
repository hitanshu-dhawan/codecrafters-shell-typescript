import * as fs from "fs";
import { ChildProcess } from "child_process";

/**
 * Represents a single background job tracked by the shell.
 */
export interface Job {
    /** The job number (starts at 1, recycled when jobs complete). */
    number: number;
    /** The process ID assigned by the operating system. */
    pid: number;
    /** The command string (without the trailing `&`). */
    command: string;
    /** The spawned child process. */
    child: ChildProcess;
    /** Whether the process has exited. */
    exited: boolean;
}

/** Width of the status field in the `jobs` output (e.g. "Running" padded to 24). */
const STATUS_WIDTH = 24;

/**
 * Tracks background jobs and produces the `jobs` builtin output.
 *
 * Responsibilities:
 * - Assign job numbers, recycling the smallest available number.
 * - Mark jobs as exited when their process finishes.
 * - Format and print job listings with `+`/`-` markers.
 * - Reap (display once as `Done`, then remove) completed jobs.
 */
export class JobManager {
    private jobs: Job[] = [];

    /**
     * Registers a new background job, assigning the smallest available number.
     *
     * @param child - The spawned background process.
     * @param command - The command string to display (without trailing `&`).
     * @returns The created job.
     */
    add(child: ChildProcess, command: string): Job {
        const number = this.nextJobNumber();
        const job: Job = { number, pid: child.pid ?? 0, command, child, exited: false };

        // Mark the job as exited when its process finishes.
        child.on("exit", () => {
            job.exited = true;
        });

        this.jobs.push(job);
        this.jobs.sort((a, b) => a.number - b.number);
        return job;
    }

    /**
     * Lists all jobs (running and done) in number order, then removes done jobs.
     * Used by the `jobs` builtin.
     *
     * @param stdout - The file descriptor to write to.
     */
    list(stdout: number): void {
        for (const job of this.jobs) {
            fs.writeSync(stdout, this.formatLine(job));
        }
        this.removeDone();
    }

    /**
     * Prints a `Done` line for each exited job, then removes them.
     * Used to reap jobs before printing each prompt.
     *
     * @param stdout - The file descriptor to write to.
     */
    reap(stdout: number): void {
        for (const job of this.jobs) {
            if (job.exited) {
                fs.writeSync(stdout, this.formatLine(job));
            }
        }
        this.removeDone();
    }

    /**
     * Returns the smallest positive integer not currently used as a job number.
     */
    private nextJobNumber(): number {
        const used = new Set(this.jobs.map((j) => j.number));
        let n = 1;
        while (used.has(n)) {
            n++;
        }
        return n;
    }

    /**
     * Determines the marker for a job based on the current list of jobs:
     * `+` for the highest job number, `-` for the second highest, space otherwise.
     */
    private markerFor(job: Job): string {
        const sorted = [...this.jobs].sort((a, b) => a.number - b.number);
        if (sorted.length >= 1 && job.number === sorted[sorted.length - 1].number) {
            return "+";
        }
        if (sorted.length >= 2 && job.number === sorted[sorted.length - 2].number) {
            return "-";
        }
        return " ";
    }

    /**
     * Formats a single job line for the `jobs` output.
     */
    private formatLine(job: Job): string {
        const marker = this.markerFor(job);
        const status = (job.exited ? "Done" : "Running").padEnd(STATUS_WIDTH, " ");
        const command = job.exited ? job.command : `${job.command} &`;
        return `[${job.number}]${marker}  ${status}${command}\n`;
    }

    /**
     * Removes all jobs that have exited from the table.
     */
    private removeDone(): void {
        this.jobs = this.jobs.filter((j) => !j.exited);
    }
}

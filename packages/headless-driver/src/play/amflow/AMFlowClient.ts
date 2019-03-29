import { Permission, StartPoint, AMFlow, GetStartPointOptions } from "@akashic/amflow";
import { Tick, TickList, Event, StorageData, StorageKey, StorageValue, StorageReadKey } from "@akashic/playlog";
import { getSystemLogger } from "../../Logger";
import { AMFlowStore } from "./AMFlowStore";
import { createError } from "./ErrorFactory";

export type AMFlowState = "connecting" | "open" | "closing" | "closed";

/**
 * Runnerと1対1で対応するAMFlow実装。
 */
export class AMFlowClient implements AMFlow {
	playId: string;

	protected state: AMFlowState = "connecting";
	private store: AMFlowStore;

	private permission: Permission = null;
	private tickHandlers: ((tick: Tick) => void)[] = [];
	private eventHandlers: ((event: Event) => void)[] = [];
	private unconsumedEvents: Event[] = [];

	constructor(playId: string, store: AMFlowStore) {
		this.playId = playId;
		this.store = store;
	}

	open(playId: string, callback?: (error?: Error) => void): void {
		getSystemLogger().info("AMFlowClient#open()", playId);

		this.store.sendEventTrigger.add(this.onEventSended, this);
		this.store.sendTickTrigger.add(this.onTickSended, this);
		this.state = "open";

		if (callback) {
			setImmediate(() => {
				if (this.playId !== playId) {
					callback(createError("runtime_error", "Invalid PlayID"));
				} else {
					callback();
				}
			});
		}
	}

	close(callback?: (error?: Error) => void): void {
		getSystemLogger().info("AMFlowClient#close()");
		if (this.state !== "open") {
			callback(createError("invalid_status", "Client is not open"));
			return;
		}

		this.destroy();
		this.state = "closed";

		if (callback) {
			setImmediate(() => callback());
		}
	}

	authenticate(token: string, callback: (error: Error, permission: Permission) => void): void {
		setImmediate(() => {
			if (this.state !== "open") {
				callback(createError("invalid_status", "Client is not open"), null);
				return;
			}
			const permission = this.store.authenticate(token);
			this.permission = permission;
			getSystemLogger().info("AMFlowClient#authenticate()", this.playId, token, permission);

			if (permission) {
				callback(null, permission);
			} else {
				callback(createError("invalid_status", "Invalid playToken"), null);
			}
		});
	}

	sendTick(tick: Tick): void {
		if (this.state !== "open") {
			return;
		}
		if (this.permission == null) {
			return;
		}
		if (!this.permission.writeTick) {
			return;
		}
		this.store.sendTick(tick);
	}

	onTick(handler: (tick: Tick) => void): void {
		if (this.state !== "open") {
			return;
		}
		if (this.permission == null) {
			return;
		}
		if (!this.permission.subscribeTick) {
			return;
		}
		this.tickHandlers.push(handler);
	}

	offTick(handler: (tick: Tick) => void): void {
		if (this.state !== "open") {
			return;
		}
		if (this.permission == null) {
			return;
		}
		this.tickHandlers = this.tickHandlers.filter(h => h !== handler);
	}

	sendEvent(event: Event): void {
		if (this.state !== "open") {
			return;
		}
		if (this.permission == null) {
			return;
		}
		if (!this.permission.sendEvent) {
			return;
		}
		// Max Priority
		event[1] = Math.min(event[1], this.permission.maxEventPriority);
		this.store.sendEvent(event);
	}

	onEvent(handler: (event: Event) => void): void {
		if (this.state !== "open") {
			return;
		}
		if (this.permission == null) {
			return;
		}
		if (!this.permission.subscribeEvent) {
			return;
		}
		this.eventHandlers.push(handler);

		if (0 < this.unconsumedEvents.length) {
			this.eventHandlers.forEach(h => this.unconsumedEvents.forEach(ev => h(ev)));
			this.unconsumedEvents = [];
		}
	}

	offEvent(handler: (event: Event) => void): void {
		if (this.state !== "open") {
			return;
		}
		if (this.permission == null) {
			return;
		}
		this.eventHandlers = this.eventHandlers.filter(h => h !== handler);
	}

	getTickList(from: number, to: number, callback: (error: Error, tickList: TickList) => void): void {
		setImmediate(() => {
			if (this.state !== "open") {
				callback(createError("invalid_status", "Client is not open"), null);
				return;
			}
			if (this.permission == null) {
				callback(createError("invalid_status", "Not authenticated"), null);
				return;
			}
			if (!this.permission.readTick) {
				callback(createError("permission_error", "Permission denied"), null);
				return;
			}
			const tickList = this.store.getTickList(from, to);
			if (tickList) {
				callback(null, tickList);
			} else {
				callback(createError("runtime_error", "No tick list"), null);
			}
		});
	}

	putStartPoint(startPoint: StartPoint, callback: (err: Error) => void): void {
		setImmediate(() => {
			if (this.state !== "open") {
				callback(createError("invalid_status", "Client is not open"));
				return;
			}
			if (this.permission == null) {
				callback(createError("invalid_status", "Not authenticated"));
				return;
			}
			if (!this.permission.writeTick) {
				callback(createError("permission_error", "Permission denied"));
				return;
			}
			this.store.putStartPoint(startPoint);
			callback(null);
		});
	}

	getStartPoint(opts: GetStartPointOptions, callback: (error: Error, startPoint: StartPoint) => void): void {
		setImmediate(() => {
			if (this.state !== "open") {
				callback(createError("invalid_status", "Client is not open"), null);
				return;
			}
			if (this.permission == null) {
				callback(createError("invalid_status", "Not authenticated"), null);
				return;
			}
			if (!this.permission.readTick) {
				callback(createError("permission_error", "Permission denied"), null);
				return;
			}
			const startPoint = this.store.getStartPoint(opts);
			if (startPoint) {
				callback(null, startPoint);
			} else {
				callback(createError("runtime_error", "No start point"), null);
			}
		});
	}

	putStorageData(key: StorageKey, value: StorageValue, options: any, callback: (err: Error) => void): void {
		setImmediate(() => {
			callback(createError("not_implemented", "Not implemented"));
		});
	}

	getStorageData(keys: StorageReadKey[], callback: (error: Error, values: StorageData[]) => void): void {
		setImmediate(() => {
			callback(createError("not_implemented", "Not implemented"), null);
		});
	}

	getState(): AMFlowState {
		return this.state;
	}

	destroy(): void {
		if (this.isDestroyed()) {
			return;
		}
		if (!this.store.isDestroyed()) {
			this.store.sendEventTrigger.remove(this.onEventSended, this);
			this.store.sendTickTrigger.remove(this.onTickSended, this);
		}
		this.store = null;
		this.permission = null;
		this.tickHandlers = null;
		this.eventHandlers = null;
	}

	isDestroyed(): boolean {
		return this.store == null;
	}

	private onTickSended(tick: Tick): void {
		this.tickHandlers.forEach(h => h(tick));
	}

	private onEventSended(event: Event): void {
		if (this.eventHandlers.length <= 0) {
			this.unconsumedEvents.push(event);
			return;
		}
		this.eventHandlers.forEach(h => h(event));
	}
}

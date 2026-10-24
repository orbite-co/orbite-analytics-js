import {
  CoreOptions,
  CoreOrbiteEvent,
  Callback,
  Plan,
  TrackPlan,
  PlanEvent,
  JSONArray,
  JSONValue,
  JSONPrimitive,
  JSONObject,
  GroupTraits,
  UserTraits,
  Traits,
} from '@orbite/analytics-core'

export interface Options extends CoreOptions {}

export type { GroupTraits, UserTraits, Traits }

export type EventProperties = Record<string, any>

export interface OrbiteEvent extends CoreOrbiteEvent {}

export type {
  Plan,
  TrackPlan,
  PlanEvent,
  Callback,
  JSONArray,
  JSONValue,
  JSONPrimitive,
  JSONObject,
}

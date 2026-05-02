/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    requestId?: string;
    clientAddress?: string;
    geo?: Record<string, unknown>;
  }
}

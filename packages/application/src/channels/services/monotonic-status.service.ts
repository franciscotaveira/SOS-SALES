import {
  DELIVERY_STATUS_RANK,
  type MessageDeliveryStatus,
} from "@sos-sales/contracts";

/**
 * MonotonicStatusService
 *
 * Enforces strict monotonic progression for message delivery statuses:
 * QUEUED (0) -> SENT (10) -> DELIVERED (20) -> READ (30)
 *
 * Prevents out-of-order webhooks from regressing message status (e.g. delivered arriving after read).
 * Handles 'failed' as a terminal failure that cannot regress an already sent/delivered/read message.
 */
export class MonotonicStatusService {
  /**
   * Determines whether the status should be updated based on monotonic progression.
   */
  static shouldUpdateStatus(
    currentStatus: MessageDeliveryStatus,
    newStatus: MessageDeliveryStatus
  ): boolean {
    if (currentStatus === newStatus) {
      return false;
    }

    // If newStatus is 'failed':
    // It can only apply if the current status is 'queued'. Once a message is sent, delivered, or read,
    // a delayed failure notice cannot regress the positive acknowledgment.
    if (newStatus === "failed") {
      return currentStatus === "queued";
    }

    // If currentStatus is 'failed':
    // A subsequent positive progression (e.g. provider retry succeeded) can advance to sent/delivered/read.
    if (currentStatus === "failed") {
      return newStatus !== "queued";
    }

    const currentRank = DELIVERY_STATUS_RANK[currentStatus] ?? 0;
    const newRank = DELIVERY_STATUS_RANK[newStatus] ?? 0;

    return newRank > currentRank;
  }

  /**
   * Returns the higher of the two statuses.
   */
  static resolveEffectiveStatus(
    currentStatus: MessageDeliveryStatus,
    newStatus: MessageDeliveryStatus
  ): MessageDeliveryStatus {
    return this.shouldUpdateStatus(currentStatus, newStatus)
      ? newStatus
      : currentStatus;
  }
}

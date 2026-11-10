import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { str } from '../shared/collections-data.ts';
import { clean, loadVerificationData, parseAddress, verifySender } from '../shared/collections-mail.ts';

// Read-only. Is this address a registered contact (CustomerContacts) of the customer?
// מאומת = exact address of a contact of that customer (no customer given: of exactly one customer);
// לבדיקה = the address belongs to a different customer (or several), or only the domain matches a
// contact (never a free-mail domain); לא מאומת = no match. Same rule as IngestEmail / CreateReplyDraft.
export const invoke = async (input: any, context: any) => {
  const { address } = parseAddress(input?.fromAddress);
  const customerCode = clean(input?.customerCode);
  const client = new BlocksClient(context);
  const { contacts, customersByCode } = await loadVerificationData(client, customerCode ? [customerCode] : []);
  if (customerCode && !customersByCode.has(customerCode)) {
    return {
      status: 'לא מאומת',
      address,
      customerCode,
      customerName: '',
      contactName: '',
      contactRoles: '',
      reason: `הלקוח ${customerCode} לא נמצא`,
    };
  }
  const v = verifySender(address, customerCode || null, contacts, customersByCode);
  return {
    status: v.status,
    address: v.address,
    customerCode: v.customerCode,
    customerName: str(v.customerName),
    contactName: v.contactName,
    contactRoles: v.contactRoles,
    reason: v.reason,
  };
};

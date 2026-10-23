/** I1: deduplicate inside the caller's effects transaction. */
export const I1 = `
insert into {{inbox}} (consumer, message_id)
values ($1::text, $2::text)
on conflict (consumer, message_id) do nothing
returning true as inserted;
`;

import { defineHandler, createEventStream } from "nitro/h3";
import { useDocs } from "../docs.ts";

export default defineHandler(async (event) => {
  const docs = await useDocs();
  const eventStream = createEventStream(event);

  const unsub = docs.onChange((path) => {
    eventStream.push(JSON.stringify({ path }));
  });

  eventStream.onClosed(() => {
    unsub();
  });

  return eventStream.send();
});

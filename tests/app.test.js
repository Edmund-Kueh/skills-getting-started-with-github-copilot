const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");

class Element {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.value = "";
    this.classList = { add() {}, remove() {} };
  }

  set innerHTML(html) {
    this.html = html;
    this.children = [];
  }

  set length(length) {
    this.children.length = length;
  }

  appendChild(child) {
    this.children.push(child);
  }

  setAttribute() {}

  addEventListener(event, listener) {
    this.listeners[event] = listener;
  }

  reset() {
    this.value = "";
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const response = (data) => ({ ok: true, json: async () => data });

function setup(fetch) {
  const elements = Object.fromEntries(
    ["activities-list", "activity", "signup-form", "message", "email"].map(
      (id) => [id, new Element()]
    )
  );
  elements.activity.appendChild(new Element());
  vm.runInNewContext(
    readFileSync(new URL("../src/static/app.js", `file://${__filename}`), "utf8"),
    {
      document: {
        getElementById: (id) => elements[id],
        createElement: () => new Element(),
        addEventListener: (_, listener) => listener(),
      },
      fetch,
      console: { error() {} },
      setTimeout() {},
    }
  );
  elements.email.value = "new@example.com";
  elements.activity.value = "Chess Club";
  return elements;
}

function assertSignedUp(elements) {
  const cards = elements["activities-list"].children;
  assert.equal(cards.length, 1);
  const card = cards[0];
  assert.match(card.html, /4 spots left/);
  const section = card.children[0];
  assert.equal(section.children[0].textContent, "Participants (1)");
  assert.equal(
    section.children[1].children[0].children[0].textContent,
    "new@example.com"
  );
  assert.equal(elements.activity.children.length, 2);
}

for (const earlierRefresh of ["completed", "delayed", "failed late"]) {
  test(`signup updates cards when an earlier refresh is ${earlierRefresh}`, async () => {
    const activity = {
      description: "Play chess",
      schedule: "Monday",
      max_participants: 5,
      participants: ["existing@example.com"],
    };
    let getCount = 0;
    let finishEarlierRefresh;
    const elements = setup(async (url, options) => {
      if (options?.method === "DELETE") {
        activity.participants = [];
        return response({ message: "Unregistered" });
      }
      if (options?.method === "POST") {
        assert.equal(
          url,
          "/activities/Chess%20Club/signup?email=new%40example.com"
        );
        activity.participants.push("new@example.com");
        return response({ message: "Signed up" });
      }

      const snapshot = structuredClone({ "Chess Club": activity });
      if (++getCount === 2 && earlierRefresh !== "completed") {
        return new Promise((resolve, reject) => {
          finishEarlierRefresh = () =>
            earlierRefresh === "delayed"
              ? resolve(response(snapshot))
              : reject(new Error("Earlier refresh failed"));
        });
      }
      return response(snapshot);
    });

    await flush();
    const deleteButton = elements["activities-list"].children[0]
      .children[0].children[1].children[0].children[1];
    const unregister = deleteButton.listeners.click();
    await flush();
    await elements["signup-form"].listeners.submit({ preventDefault() {} });
    assertSignedUp(elements);
    assert.equal(getCount, 3);
    assert.equal(elements.message.className, "success");

    if (finishEarlierRefresh) {
      finishEarlierRefresh();
    }
    await unregister;
    assertSignedUp(elements);
  });
}

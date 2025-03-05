"use strict";
let client = null;

function setClient(newClient) {
  client = newClient;
}

async function infoGet(id) {
  try {
    let info = await client.getInfo(id);
    return info;
  } catch (error) {
    return;
  }
}

async function search(q, page, limit) {
  if (!q) return;
  try {
    return(await client.search(q, { type: "all", limit, pages: page }));
  } catch (error) {
    return null;
  }
}

module.exports = { 
  infoGet, 
  setClient,
  search
};
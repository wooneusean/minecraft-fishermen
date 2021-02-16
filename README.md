# Minecraft Fishing Bot

Minecraft fishing bot made using [Mineflayer](https://github.com/PrismarineJS/mineflayer)

## What it can do

1. Navigate to a fishing spot
2. Send chat message on what it caught
3. Store items in a nearby chest
4. Sleep when it is night (Only if there are unoccupied beds)
5. Go to you, or a (x, y, z) coordinate

## How to use

To start the bot, the bot must be run with these arguments:

`node fisherman.js <prefix> <host> <port> [<name>] [<password>]`

`prefix`: the prefix to call your bot.

`host`: the IP of the server you want the bot to connect to (can be localhost).

`port`: the port of the server you want the bot to connect to.

`name`: username to log in to minecraft (can be anything if joining an offline-mode server)

`password`(optional): optional if joining a offline-mode server. Password to the minecraft account.

## Commands

### goto

```
`<prefix> goto <player>|<x y z>`
```

`<player>` can be a player name or `me` if you want the bot to go to you.

### start

```
`<prefix> start
```

Goes to the closest body of water and starts fishing.

### stop

```
`<prefix> stop
```

Stops fishing.

### store

```
`<prefix> store
```

Goes to the closest chest and stores the items fished.

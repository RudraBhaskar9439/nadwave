// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Patio contributors; Nadwave contributors.
// Adapted from PatioOpenRegistry. See licenses/Patio-MIT.txt and THIRD_PARTY_NOTICES.md.
pragma solidity ^0.8.24;

/// @notice Public room permissions only. Messages, media, names and keys stay offchain.
contract NadwaveRooms {
    struct Room { address operator; uint64 expiresAt; bool closed; }
    address public immutable owner;
    uint64 public constant ROOM_LIFETIME = 1 days;
    mapping(bytes16 => Room) public rooms;
    mapping(bytes16 => mapping(address => bool)) private members;
    event RoomRegistered(bytes16 indexed roomId, address indexed operator, uint64 expiresAt);
    event MembershipChanged(bytes16 indexed roomId, address indexed member, bool allowed);
    event RoomClosed(bytes16 indexed roomId, address indexed operator);
    error InvalidRoom();
    error Unauthorized();
    error InvalidMember();

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert InvalidMember();
        owner = initialOwner;
    }

    function registerRoom(bytes16 roomId) external {
        if (roomId == bytes16(0) || rooms[roomId].operator != address(0)) revert InvalidRoom();
        uint64 expiresAt = uint64(block.timestamp) + ROOM_LIFETIME;
        rooms[roomId] = Room(msg.sender, expiresAt, false);
        emit RoomRegistered(roomId, msg.sender, expiresAt);
    }

    function setMember(bytes16 roomId, address member, bool allowed) external {
        Room memory room = rooms[roomId];
        if (room.operator != msg.sender) revert Unauthorized();
        if (room.closed || room.expiresAt <= block.timestamp) revert InvalidRoom();
        if (member == address(0) || member == room.operator) revert InvalidMember();
        members[roomId][member] = allowed;
        emit MembershipChanged(roomId, member, allowed);
    }

    function isMember(bytes16 roomId, address member) external view returns (bool) {
        Room memory room = rooms[roomId];
        return member != address(0) && !room.closed && room.expiresAt > block.timestamp
            && (member == room.operator || members[roomId][member]);
    }

    function closeRoom(bytes16 roomId) external {
        Room storage room = rooms[roomId];
        if (room.operator == address(0) || room.closed) revert InvalidRoom();
        if (msg.sender != room.operator && msg.sender != owner) revert Unauthorized();
        room.closed = true;
        emit RoomClosed(roomId, room.operator);
    }
}

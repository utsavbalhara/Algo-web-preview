import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Calculator, AlertCircle, CheckCircle, Users, Building } from 'lucide-react';

interface Section {
  id: number;
  branch: string;
  section: string;
  students: number;
}

interface Room {
  no: string;
  capacity: number;
  rows: number[];
}

interface RoomBlock {
  name: string;
  rooms: Room[];
}

interface Allocation {
  branch: string;
  section: string;
  roomNo: string;
  students: number;
  startSeat?: number;
  endSeat?: number;
  partial?: boolean;
  emergency?: boolean;
  error?: boolean;
  blockName?: string;
}

interface Stats {
  totalStudents: number;
  allocatedStudents: number;
  roomsUsed: number;
  blocksUsed: number;
  totalCapacity: number;
  wastedSeats: number;
  efficiency: string;
}

const ALGO_OPTIONS = [
  { value: 1, label: '1. Simple Greedy' },
  { value: 2, label: '2. Greedy with Min Chunk' },
  { value: 3, label: '3. Greedy Lookahead' },
  { value: 4, label: '4. Best-Fit/First-Fit Decreasing' },
];

const ALGO_EXPLANATIONS: Record<number, string> = {
  1: `Simple Greedy: Fills each room with as much of the current section as possible, then moves to the next room/section. Fast and simple, but can leave small numbers of students from a section in a room.`,
  2: `Greedy with Min Chunk: Like Simple Greedy, but never allocates fewer than a threshold (e.g., 10) students from a section to a room unless it's the only way. Reduces tiny fragments, but may leave some seats empty if no good fit is found.`,
  3: `Greedy Lookahead: When a room can't be filled by one section, looks for another section (or sections) that can be combined to fill the room as closely as possible, minimizing small fragments. Fewer awkward splits, more balanced rooms.`,
  4: `Best-Fit/First-Fit Decreasing: Sorts sections and rooms by size, then tries to fit sections into rooms as efficiently as possible, possibly combining sections to fill rooms. Good overall efficiency, fewer splits than simple greedy.`
};

const ExamSeatingAllocator: React.FC = () => {
  const [sections, setSections] = useState<Section[]>([
    { id: 1, branch: 'BT', section: '1', students: 77 },
    { id: 2, branch: 'CSE', section: '1', students: 123 },
    { id: 3, branch: 'CSE', section: '2', students: 123 },
    { id: 4, branch: 'CSAI', section: '1', students: 81 },
    { id: 5, branch: 'CSAI', section: '2', students: 76 },
    { id: 6, branch: 'CSDS', section: '1', students: 80 },
    { id: 7, branch: 'EE', section: '1', students: 92 },
    { id: 8, branch: 'EE', section: '2', students: 90 },
    { id: 9, branch: 'ECE', section: '1', students: 110 },
    { id: 10, branch: 'ECE', section: '2', students: 111 },
    { id: 11, branch: 'IT', section: '1', students: 79 },
    { id: 12, branch: 'IT', section: '2', students: 81 },
    { id: 13, branch: 'ITNS', section: '1', students: 75 },
    { id: 14, branch: 'ICE', section: '1', students: 90 },
    { id: 15, branch: 'ICE', section: '2', students: 91 },
    { id: 16, branch: 'MAC', section: '1', students: 90 },
    { id: 17, branch: 'ME', section: '1', students: 110 },
    { id: 18, branch: 'ME', section: '2', students: 104 },
    { id: 19, branch: 'VLSI', section: '1', students: 71 },
  ]);

  const [allocation, setAllocation] = useState<Allocation[]>([]);
  const [stats, setStats] = useState<Stats>({} as Stats);
  const [algorithm, setAlgorithm] = useState<number>(3);
  const [minChunk, setMinChunk] = useState<number>(10);
  const [roomBlocks, setRoomBlocks] = useState<RoomBlock[]>([]);

  useEffect(() => {
    // Load and parse the CSV file
    fetch('/room information.csv')
      .then(response => response.text())
      .then(csvData => {
        // Split into lines and remove empty lines
        const lines = csvData.split('\n').filter(line => line.trim());

        // Get headers from first line
        const headers = lines[0].split(',').map(h => h.trim());

        // Process each line (skip header)
        const blocks: { [key: string]: Room[] } = {};

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim());
          const blockName = values[headers.indexOf('BLOCK')];
          const roomNo = values[headers.indexOf('ROOM NO')];
          const capacity = parseInt(values[headers.indexOf('Total Count')]);

          // Parse row data
          const rows: number[] = [];
          for (let j = 1; j <= 8; j++) {
            const rowValue = values[headers.indexOf(`ROW-${j}`)];
            if (rowValue && rowValue.toLowerCase() !== 'x') {
              rows.push(parseInt(rowValue));
            }
          }

          if (!blocks[blockName]) {
            blocks[blockName] = [];
          }

          blocks[blockName].push({
            no: roomNo,
            capacity,
            rows
          });
        }

        // Convert blocks object to array format
        const roomBlocksArray = Object.entries(blocks).map(([name, rooms]) => ({
          name: `${name} Block`,
          rooms: rooms.sort((a, b) => a.no.localeCompare(b.no))
        }));

        setRoomBlocks(roomBlocksArray);
      })
      .catch(error => {
        console.error('Error loading room data:', error);
      });
  }, []);

  const addSection = () => {
    const newId = Math.max(...sections.map(s => s.id), 0) + 1;
    setSections([...sections, { id: newId, branch: '', section: '', students: 50 }]);
  };

  const removeSection = (id: number) => {
    setSections(sections.filter(s => s.id !== id));
  };

  const updateSection = (id: number, field: keyof Section, value: string | number) => {
    setSections(sections.map(s =>
      s.id === id ? { ...s, [field]: field === 'students' ? parseInt(value as string) || 0 : value } : s
    ));
  };

  // --- ALGORITHMS ---
  // 1. Simple Greedy
  function allocateSimpleGreedy() {
    const result: Allocation[] = [];
    const roomUsage: Record<string, number> = {};
    const allRooms: (Room & { blockName: string })[] = roomBlocks.flatMap(block =>
      block.rooms.map(room => ({ ...room, blockName: block.name }))
    ).sort((a, b) => b.capacity - a.capacity);
    const sectionLeft: Section[] = sections.filter(s => s.branch && s.section && s.students > 0).map(s => ({ ...s }));
    sectionLeft.sort((a, b) => b.students - a.students);
    for (const section of sectionLeft) {
      let remaining = section.students;
      for (const room of allRooms) {
        if (remaining === 0) break;
        const used = roomUsage[room.no] || 0;
        const available = room.capacity - used;
        if (available <= 0) continue;
        let toAllocate = Math.min(available, remaining);
        // Prevent starting a room with a small chunk unless it's the only way
        if (used === 0 && toAllocate < minChunk && remaining === toAllocate) {
          // Only allow if no other room has any students (all rooms empty)
          const anyRoomHasStudents = allRooms.some(r => (roomUsage[r.no] || 0) > 0);
          if (!anyRoomHasStudents) {
            // Allow placing the last small chunk in an empty room
          } else {
            continue;
          }
        } else if (toAllocate < minChunk && remaining > minChunk) {
          continue;
        }
        result.push({
          branch: section.branch,
          section: section.section,
          roomNo: room.no,
          students: toAllocate,
          startSeat: used + 1,
          endSeat: used + toAllocate,
          partial: toAllocate !== section.students,
          blockName: room.blockName
        });
        roomUsage[room.no] = used + toAllocate;
        remaining -= toAllocate;
      }
      if (remaining > 0) {
        result.push({
          branch: section.branch,
          section: section.section,
          roomNo: "NO SPACE",
          students: remaining,
          error: true
        });
      }
    }
    return { result, roomUsage };
  }

  // 2. Greedy with Min Chunk
  function allocateGreedyMinChunk() {
    const result: Allocation[] = [];
    const roomUsage: Record<string, number> = {};
    const allRooms: (Room & { blockName: string })[] = roomBlocks.flatMap(block =>
      block.rooms.map(room => ({ ...room, blockName: block.name }))
    ).sort((a, b) => b.capacity - a.capacity);
    const sectionLeft: Section[] = sections.filter(s => s.branch && s.section && s.students > 0).map(s => ({ ...s }));
    sectionLeft.sort((a, b) => b.students - a.students);
    for (const section of sectionLeft) {
      let remaining = section.students;
      for (const room of allRooms) {
        if (remaining === 0) break;
        const used = roomUsage[room.no] || 0;
        const available = room.capacity - used;
        if (available <= 0) continue;
        let toAllocate = Math.min(available, remaining);
        // Prevent starting a room with a small chunk unless it's the only way
        if (used === 0 && toAllocate < minChunk && remaining === toAllocate) {
          const anyRoomHasStudents = allRooms.some(r => (roomUsage[r.no] || 0) > 0);
          if (!anyRoomHasStudents) {
            // Allow placing the last small chunk in an empty room
          } else {
            continue;
          }
        } else if (toAllocate < minChunk && remaining > minChunk) {
          continue;
        }
        result.push({
          branch: section.branch,
          section: section.section,
          roomNo: room.no,
          students: toAllocate,
          startSeat: used + 1,
          endSeat: used + toAllocate,
          partial: toAllocate !== section.students,
          blockName: room.blockName
        });
        roomUsage[room.no] = used + toAllocate;
        remaining -= toAllocate;
      }
      if (remaining > 0) {
        result.push({
          branch: section.branch,
          section: section.section,
          roomNo: "NO SPACE",
          students: remaining,
          error: true
        });
      }
    }
    return { result, roomUsage };
  }

  // 3. Greedy Lookahead (Coordinated Filling)
  function allocateGreedyLookahead() {
    const result: Allocation[] = [];
    const roomUsage: Record<string, number> = {};
    const sectionLeft: Section[] = sections
      .filter(s => s.branch && s.section && s.students > 0)
      .map(s => ({ ...s }));
    const allRooms: (Room & { blockName: string })[] = roomBlocks.flatMap(block =>
      block.rooms.map(room => ({ ...room, blockName: block.name }))
    ).sort((a, b) => b.capacity - a.capacity);
    sectionLeft.sort((a, b) => b.students - a.students);
    for (const room of allRooms) {
      let seatsLeft = room.capacity;
      let allocationsForRoom: Allocation[] = [];
      // Try to find a section that fits perfectly
      let perfectIdx = sectionLeft.findIndex(s => s.students === seatsLeft);
      if (perfectIdx !== -1) {
        const s = sectionLeft[perfectIdx];
        allocationsForRoom.push({
          branch: s.branch,
          section: s.section,
          roomNo: room.no,
          students: seatsLeft,
          startSeat: 1,
          endSeat: seatsLeft,
          blockName: room.blockName
        });
        sectionLeft.splice(perfectIdx, 1);
        seatsLeft = 0;
      }
      // If not perfect, try to fill with largest possible section(s)
      while (seatsLeft > 0 && sectionLeft.length > 0) {
        let bestIdx = -1;
        let bestChunk = 0;
        for (let i = 0; i < sectionLeft.length; ++i) {
          const s = sectionLeft[i];
          if (s.students <= seatsLeft && s.students > bestChunk) {
            bestChunk = s.students;
            bestIdx = i;
          }
        }
        if (bestIdx !== -1) {
          const s = sectionLeft[bestIdx];
          // Prevent starting a room with a small chunk unless it's the only way
          if ((room.capacity - seatsLeft === 0) && s.students < minChunk && s.students === sectionLeft[bestIdx].students) {
            const anyRoomHasStudents = allRooms.some(r => (roomUsage[r.no] || 0) > 0);
            if (!anyRoomHasStudents) {
              // Allow placing the last small chunk in an empty room
            } else {
              break;
            }
          } else if (s.students < minChunk && s.students !== sectionLeft[bestIdx].students) {
            break;
          }
          allocationsForRoom.push({
            branch: s.branch,
            section: s.section,
            roomNo: room.no,
            students: s.students,
            startSeat: room.capacity - seatsLeft + 1,
            endSeat: room.capacity - seatsLeft + s.students,
            blockName: room.blockName
          });
          seatsLeft -= s.students;
          sectionLeft.splice(bestIdx, 1);
          continue;
        }
        sectionLeft.sort((a, b) => b.students - a.students);
        const s = sectionLeft[0];
        if (s.students - seatsLeft > 0 && s.students - seatsLeft < minChunk && seatsLeft < minChunk) {
          break;
        }
        const chunk = Math.min(seatsLeft, s.students);
        if ((room.capacity - seatsLeft === 0) && chunk < minChunk && s.students === chunk) {
          const anyRoomHasStudents = allRooms.some(r => (roomUsage[r.no] || 0) > 0);
          if (!anyRoomHasStudents) {
            // Allow placing the last small chunk in an empty room
          } else {
            break;
          }
        } else if (chunk < minChunk && s.students > minChunk) break;
        allocationsForRoom.push({
          branch: s.branch,
          section: s.section,
          roomNo: room.no,
          students: chunk,
          startSeat: room.capacity - seatsLeft + 1,
          endSeat: room.capacity - seatsLeft + chunk,
          partial: true,
          blockName: room.blockName
        });
        s.students -= chunk;
        seatsLeft -= chunk;
        if (s.students === 0) sectionLeft.shift();
      }
      result.push(...allocationsForRoom);
      if (allocationsForRoom.length > 0) {
        roomUsage[room.no] = room.capacity - seatsLeft;
      }
    }
    for (const s of sectionLeft) {
      if (s.students > 0) {
        result.push({
          branch: s.branch,
          section: s.section,
          roomNo: "NO SPACE",
          students: s.students,
          error: true
        });
      }
    }
    return { result, roomUsage };
  }

  // 4. Best-Fit/First-Fit Decreasing
  // This algorithm sorts sections and rooms by size, then tries to fit each section into the best-fitting room (the smallest room that can fit the section).
  // If no perfect fit is found, it uses the first room with available space, possibly splitting the section across multiple rooms.
  // It respects the minChunk constraint, so no small group is placed at the start of a room unless it's the only way.
  // This approach generally improves efficiency and reduces splits compared to simple greedy, but may still split sections if needed.
  // Room usage order and block advancement are enforced as per user requirements.
  function allocateBestFitFFD() {
    const result: Allocation[] = [];
    const roomUsage: Record<string, number> = {};
    // Flatten rooms in the exact order specified by the user
    const orderedRoomBlocks = [
      // APJ Block
      ["APJ-1","APJ-2","APJ-3","APJ-4","APJ-5","APJ-6","APJ-7","APJ-8","APJ-9","APJ-10","APJ-11"],
      // S Block
      ["S-01","S-02","S-03","S-04"],
      // 8A Block
      ["002/8A","003/8A","102/8A","103/8A","110/8A"],
      // 5 Block (Main)
      ["13/5","14/5","15/5","17/5","22/5","24/5","27/5","28/5"],
      // 5 Block (100s)
      ["116/5","119/5","138/5"],
      // 5 Block (200s)
      ["215/5","216/5","217/5","219/5","221/5","222/5"],
      // 5 Block (300s)
      ["301/5","305/5","306/5","307/5","311/5","312/5"],
      // 6 Block (100s)
      ["113/6","114/6","117/6","127/6"],
      // 6 Block (300s)
      ["313/6","314/6"],
      // 4 Block
      ["13/4","14/4","17/4","24/4"],
      // MPC Block
      ["MPC-01","MPC-02"]
    ];
    // Map roomNo to block index for fast lookup
    const roomToBlockIdx: Record<string, number> = {};
    orderedRoomBlocks.forEach((block, idx) => block.forEach(roomNo => { roomToBlockIdx[roomNo] = idx; }));
    // Flatten all rooms in order
    const allRooms: (Room & { blockName: string })[] = orderedRoomBlocks.flatMap((block, blockIdx) =>
      block.map(roomNo => {
        const blockObj = roomBlocks.find(b => b.rooms.some(r => r.no === roomNo));
        const roomObj = blockObj?.rooms.find(r => r.no === roomNo);
        return { ...roomObj!, blockName: blockObj?.name || "" };
      })
    );
    const sectionLeft: Section[] = sections.filter(s => s.branch && s.section && s.students > 0).map(s => ({ ...s }));
    sectionLeft.sort((a, b) => b.students - a.students);
    let maxBlockIdx = 0;
    for (const section of sectionLeft) {
      let remaining = section.students;
      while (remaining > 0) {
        // Only consider rooms in blocks up to maxBlockIdx
        let bestRoomIdx = -1;
        let bestRoomSpace = Infinity;
        for (let i = 0; i < allRooms.length; ++i) {
          const room = allRooms[i];
          const blockIdx = roomToBlockIdx[room.no];
          if (blockIdx > maxBlockIdx) continue;
          const used = roomUsage[room.no] || 0;
          const available = room.capacity - used;
          if (available >= remaining && available < bestRoomSpace) {
            bestRoomSpace = available;
            bestRoomIdx = i;
          }
        }
        if (bestRoomIdx !== -1) {
          const room = allRooms[bestRoomIdx];
          const used = roomUsage[room.no] || 0;
          // Prevent starting a room with a small chunk unless it's the only way
          if (used === 0 && remaining < minChunk && remaining === section.students) {
            const anyRoomHasStudents = allRooms.some(r => (roomUsage[r.no] || 0) > 0);
            if (!anyRoomHasStudents) {
              // Allow placing the last small chunk in an empty room
            } else {
              break;
            }
          } else if (remaining < minChunk && remaining !== section.students) break;
          result.push({
            branch: section.branch,
            section: section.section,
            roomNo: room.no,
            students: remaining,
            startSeat: used + 1,
            endSeat: used + remaining,
            blockName: room.blockName
          });
          roomUsage[room.no] = used + remaining;
          // After using a room, check if all rooms in current block are used, then unlock next block
          const currentBlockRooms = orderedRoomBlocks[maxBlockIdx];
          if (currentBlockRooms.every(rn => (roomUsage[rn] || 0) > 0) && maxBlockIdx < orderedRoomBlocks.length - 1) {
            maxBlockIdx++;
          }
          remaining = 0;
          continue;
        }
        // If no best-fit, use first-fit in current blocks
        let allocated = false;
        for (let i = 0; i < allRooms.length; ++i) {
          const room = allRooms[i];
          const blockIdx = roomToBlockIdx[room.no];
          if (blockIdx > maxBlockIdx) continue;
          const used = roomUsage[room.no] || 0;
          const available = room.capacity - used;
          if (available <= 0) continue;
          let toAllocate = Math.min(available, remaining);
          // Prevent starting a room with a small chunk unless it's the only way
          if (used === 0 && toAllocate < minChunk && remaining === toAllocate) {
            const anyRoomHasStudents = allRooms.some(r => (roomUsage[r.no] || 0) > 0);
            if (!anyRoomHasStudents) {
              // Allow placing the last small chunk in an empty room
            } else {
              continue;
            }
          } else if (toAllocate < minChunk && remaining > minChunk) {
            continue;
          }
          result.push({
            branch: section.branch,
            section: section.section,
            roomNo: room.no,
            students: toAllocate,
            startSeat: used + 1,
            endSeat: used + toAllocate,
            partial: toAllocate !== section.students,
            blockName: room.blockName
          });
          roomUsage[room.no] = used + toAllocate;
          // After using a room, check if all rooms in current block are used, then unlock next block
          const currentBlockRooms = orderedRoomBlocks[maxBlockIdx];
          if (currentBlockRooms.every(rn => (roomUsage[rn] || 0) > 0) && maxBlockIdx < orderedRoomBlocks.length - 1) {
            maxBlockIdx++;
          }
          remaining -= toAllocate;
          allocated = true;
          break;
        }
        if (!allocated) {
          // Could not allocate in current blocks
          break;
        }
      }
      if (remaining > 0) {
        result.push({
          branch: section.branch,
          section: section.section,
          roomNo: "NO SPACE",
          students: remaining,
          error: true
        });
      }
    }
    return { result, roomUsage };
  }

  // --- END ALGORITHMS ---

  const allocateSeats = () => {
    if (!roomBlocks.length) {
      alert("Room data is still loading. Please try again in a moment.");
      return;
    }
    let allocationResult;
    if (algorithm === 1) allocationResult = allocateSimpleGreedy();
    else if (algorithm === 2) allocationResult = allocateGreedyMinChunk();
    else if (algorithm === 3) allocationResult = allocateGreedyLookahead();
    else allocationResult = allocateBestFitFFD();
    const { result, roomUsage } = allocationResult;
    setAllocation(result);
    // Calculate statistics
    const totalStudents = sections.reduce((sum, s) => sum + (s.students || 0), 0);
    const allocatedStudents = result.filter(r => !r.error).reduce((sum, r) => sum + r.students, 0);
    const roomsUsed = new Set(result.filter(r => !r.error).map(r => r.roomNo)).size;
    const blocksUsed = new Set(result.filter(r => !r.error && r.blockName).map(r => r.blockName)).size;
    let totalCapacity = 0;
    for (const [roomNo, used] of Object.entries(roomUsage)) {
      const room = roomBlocks.flatMap(b => b.rooms).find(r => r.no === roomNo);
      if (room) totalCapacity += room.capacity;
    }
    const wastedSeats = totalCapacity - allocatedStudents;
    setStats({
      totalStudents,
      allocatedStudents,
      roomsUsed,
      blocksUsed,
      totalCapacity,
      wastedSeats,
      efficiency: totalCapacity > 0 ? ((allocatedStudents / totalCapacity) * 100).toFixed(1) : '0'
    });
  };

  const getSectionProgressColor = (branch: string, section: string) => {
    const branchColors: Record<string, Record<string, string>> = {
      'BT':    { '1': 'bg-amber-500', '2': 'bg-amber-600', '3': 'bg-amber-700', '4': 'bg-amber-800' },
      'CSE':   { '1': 'bg-blue-500',  '2': 'bg-blue-600',  '3': 'bg-blue-700',  '4': 'bg-blue-800' },
      'CSAI':  { '1': 'bg-cyan-500',  '2': 'bg-cyan-600',  '3': 'bg-cyan-700',  '4': 'bg-cyan-800' },
      'CSDS':  { '1': 'bg-rose-500',  '2': 'bg-rose-600',  '3': 'bg-rose-700',  '4': 'bg-rose-800' },
      'EE':    { '1': 'bg-orange-500','2': 'bg-orange-600','3': 'bg-orange-700','4': 'bg-orange-800' },
      'ECE':   { '1': 'bg-green-500', '2': 'bg-green-600', '3': 'bg-green-700', '4': 'bg-green-800' },
      'IT':    { '1': 'bg-indigo-500','2': 'bg-indigo-600','3': 'bg-indigo-700','4': 'bg-indigo-800' },
      'ITNS':  { '1': 'bg-teal-500',  '2': 'bg-teal-600',  '3': 'bg-teal-700',  '4': 'bg-teal-800' },
      'ICE':   { '1': 'bg-violet-500','2': 'bg-violet-600','3': 'bg-violet-700','4': 'bg-violet-800' },
      'MAC':   { '1': 'bg-lime-500',  '2': 'bg-lime-600',  '3': 'bg-lime-700',  '4': 'bg-lime-800' },
      'ME':    { '1': 'bg-yellow-500','2': 'bg-yellow-600','3': 'bg-yellow-700','4': 'bg-yellow-800' },
      'VLSI':  { '1': 'bg-fuchsia-500','2': 'bg-fuchsia-600','3': 'bg-fuchsia-700','4': 'bg-fuchsia-800' },
    };
    return branchColors[branch]?.[section] || 'bg-gray-500';
  };

  const getSectionColor = (branch: string, section: string) => {
    const branchColors: Record<string, Record<string, string>> = {
      'BT':    { '1': 'bg-amber-100 border-amber-300', '2': 'bg-amber-50 border-amber-400', '3': 'bg-amber-100 border-amber-500', '4': 'bg-amber-50 border-amber-600' },
      'CSE':   { '1': 'bg-blue-100 border-blue-300',    '2': 'bg-blue-50 border-blue-400',    '3': 'bg-blue-100 border-blue-500',    '4': 'bg-blue-50 border-blue-600' },
      'CSAI':  { '1': 'bg-cyan-100 border-cyan-300',    '2': 'bg-cyan-50 border-cyan-400',    '3': 'bg-cyan-100 border-cyan-500',    '4': 'bg-cyan-50 border-cyan-600' },
      'CSDS':  { '1': 'bg-rose-100 border-rose-300',    '2': 'bg-rose-50 border-rose-400',    '3': 'bg-rose-100 border-rose-500',    '4': 'bg-rose-50 border-rose-600' },
      'EE':    { '1': 'bg-orange-100 border-orange-300','2': 'bg-orange-50 border-orange-400','3': 'bg-orange-100 border-orange-500','4': 'bg-orange-50 border-orange-600' },
      'ECE':   { '1': 'bg-green-100 border-green-300',  '2': 'bg-green-50 border-green-400',  '3': 'bg-green-100 border-green-500',  '4': 'bg-green-50 border-green-600' },
      'IT':    { '1': 'bg-indigo-100 border-indigo-300','2': 'bg-indigo-50 border-indigo-400','3': 'bg-indigo-100 border-indigo-500','4': 'bg-indigo-50 border-indigo-600' },
      'ITNS':  { '1': 'bg-teal-100 border-teal-300',    '2': 'bg-teal-50 border-teal-400',    '3': 'bg-teal-100 border-teal-500',    '4': 'bg-teal-50 border-teal-600' },
      'ICE':   { '1': 'bg-violet-100 border-violet-300','2': 'bg-violet-50 border-violet-400','3': 'bg-violet-100 border-violet-500','4': 'bg-violet-50 border-violet-600' },
      'MAC':   { '1': 'bg-lime-100 border-lime-300',    '2': 'bg-lime-50 border-lime-400',    '3': 'bg-lime-100 border-lime-500',    '4': 'bg-lime-50 border-lime-600' },
      'ME':    { '1': 'bg-yellow-100 border-yellow-300','2': 'bg-yellow-50 border-yellow-400','3': 'bg-yellow-100 border-yellow-500','4': 'bg-yellow-50 border-yellow-600' },
      'VLSI':  { '1': 'bg-fuchsia-100 border-fuchsia-300','2': 'bg-fuchsia-50 border-fuchsia-400','3': 'bg-fuchsia-100 border-fuchsia-500','4': 'bg-fuchsia-50 border-fuchsia-600' },
    };
    return branchColors[branch]?.[section] || 'bg-gray-100 border-gray-300';
  };

  const groupedAllocation = allocation.reduce((acc: Record<string, Allocation[]>, item) => {
    const key = `${item.branch}-${item.section}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-3">
          <Building className="text-blue-600" />
          Intelligent Exam Seating Allocator
        </h1>

        {/* Algorithm Dropdown and min chunk input */}
        <div className="mb-6 flex flex-col md:flex-row md:items-end gap-4">
          <div>
            <label htmlFor="algorithm-select" className="block mb-2 font-medium text-gray-700">Select Allocation Algorithm:</label>
            <select
              id="algorithm-select"
              className="px-3 py-2 border rounded-md w-full max-w-xs"
              value={algorithm}
              onChange={e => setAlgorithm(Number(e.target.value))}
            >
              {ALGO_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="min-chunk" className="block mb-2 font-medium text-gray-700">Minimum students per section in a room:</label>
            <input
              id="min-chunk"
              type="number"
              min={1}
              className="px-3 py-2 border rounded-md w-40"
              value={minChunk}
              onChange={e => setMinChunk(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Statistics Dashboard */}
        {Object.keys(stats).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.totalStudents}</div>
              <div className="text-sm text-gray-600">Total Students</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.allocatedStudents}</div>
              <div className="text-sm text-gray-600">Allocated</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.roomsUsed}</div>
              <div className="text-sm text-gray-600">Rooms Used</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.totalCapacity}</div>
              <div className="text-sm text-gray-600">Total Capacity</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.wastedSeats}</div>
              <div className="text-sm text-gray-600">Wasted Seats</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-600">{stats.blocksUsed}</div>
              <div className="text-sm text-gray-600">Blocks Used</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-cyan-600">{stats.efficiency}%</div>
              <div className="text-sm text-gray-600">Efficiency</div>
            </div>
          </div>
        )}

        {/* Section Input */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Users className="text-green-600" />
            Student Sections
          </h2>

          <div className="space-y-3">
            {sections.map((section) => (
              <div key={section.id} className="flex gap-3 items-center p-3 bg-gray-50 rounded-lg">
                <input
                  type="text"
                  placeholder="Branch (e.g., CSE)"
                  value={section.branch}
                  onChange={(e) => updateSection(section.id, 'branch', e.target.value)}
                  className="px-3 py-2 border rounded-md w-32"
                />
                <input
                  type="text"
                  placeholder="Section (e.g., A)"
                  value={section.section}
                  onChange={(e) => updateSection(section.id, 'section', e.target.value)}
                  className="px-3 py-2 border rounded-md w-24"
                />
                <input
                  type="number"
                  placeholder="Students"
                  value={section.students || ''}
                  onChange={(e) => updateSection(section.id, 'students', e.target.value)}
                  className="px-3 py-2 border rounded-md w-24"
                />
                <button
                  onClick={() => removeSection(section.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                  title="Remove section"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addSection}
            className="mt-3 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Plus size={18} />
            Add Section
          </button>
        </div>

        <button
          onClick={allocateSeats}
          className="mb-6 flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
        >
          <Calculator size={18} />
          Allocate Seats
        </button>
      </div>

      {/* Room-wise Display */}
      {allocation.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
          <h2 className="text-2xl font-semibold mb-6 text-gray-800">Room-wise Seat Distribution</h2>

          {roomBlocks.map((block, blockIdx) => {
            const blockAllocations = allocation.filter(alloc =>
              block.rooms.some(room => room.no === alloc.roomNo)
            );

            if (blockAllocations.length === 0) return null;

            // Sort rooms by capacity (descending) within each block
            const sortedRooms = [...block.rooms].sort((a, b) => b.capacity - a.capacity);

            return (
              <div key={blockIdx} className="mb-8">
                <h3 className="text-lg font-semibold mb-4 text-gray-700 border-b pb-2">
                  {block.name}
                </h3>

                <div className="grid gap-4">
                  {sortedRooms.map(room => {
                    const roomAllocations = allocation.filter(alloc => alloc.roomNo === room.no);

                    if (roomAllocations.length === 0) return null;

                    const totalUsed = roomAllocations.reduce((sum, alloc) => sum + alloc.students, 0);
                    const wastedSeats = room.capacity - totalUsed;

                    return (
                      <div key={room.no} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-semibold text-gray-800">{room.no}</span>
                          <span className="text-sm text-gray-600">
                            {totalUsed}/{room.capacity} seats ({((totalUsed/room.capacity)*100).toFixed(1)}% filled)
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-gray-200 rounded-full h-8 mb-3 relative overflow-hidden">
                          {roomAllocations.map((alloc, idx) => {
                            const width = (alloc.students / room.capacity) * 100;
                            const left = roomAllocations.slice(0, idx).reduce((sum, prevAlloc) =>
                              sum + (prevAlloc.students / room.capacity) * 100, 0
                            );

                            return (
                              <div
                                key={idx}
                                className={`absolute h-full flex items-center justify-center text-white text-xs font-medium ${getSectionProgressColor(alloc.branch, alloc.section)}`}
                                style={{
                                  left: `${left}%`,
                                  width: `${width}%`
                                }}
                              >
                                {width > 15 && `${alloc.branch}-${alloc.section}`}
                              </div>
                            );
                          })}

                          {/* Wasted seats (grey) */}
                          {wastedSeats > 0 && (
                            <div
                              className="absolute h-full bg-gray-400 flex items-center justify-center text-white text-xs"
                              style={{
                                left: `${(totalUsed / room.capacity) * 100}%`,
                                width: `${(wastedSeats / room.capacity) * 100}%`
                              }}
                            >
                              {((wastedSeats / room.capacity) * 100) > 10 && `Empty (${wastedSeats})`}
                            </div>
                          )}
                        </div>

                        {/* Legend for this room */}
                        <div className="flex flex-wrap gap-3 text-sm">
                          {roomAllocations.map((alloc, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded ${getSectionProgressColor(alloc.branch, alloc.section)}`}></div>
                              <span>
                                {alloc.branch}-{alloc.section}: {alloc.students} seats
                                {alloc.startSeat && ` (${alloc.startSeat}-${alloc.endSeat})`}
                              </span>
                              {alloc.partial && (
                                <span className="px-1 py-0.5 bg-yellow-200 text-yellow-800 text-xs rounded">
                                  Partial
                                </span>
                              )}
                            </div>
                          ))}
                          {wastedSeats > 0 && (
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded bg-gray-400"></div>
                              <span className="text-gray-600">Empty: {wastedSeats} seats</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Allocation Results */}
      {allocation.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-6 text-gray-800">Seat Allocation Results</h2>

          <div className="space-y-6">
            {Object.entries(groupedAllocation).map(([sectionKey, sectionAllocations]) => {
              const [branch, section] = sectionKey.split('-');
              const totalStudents = sectionAllocations.reduce((sum, alloc) => sum + alloc.students, 0);
              const hasPartial = sectionAllocations.some(alloc => alloc.partial);
              const hasError = sectionAllocations.some(alloc => alloc.error);

              return (
                <div key={sectionKey} className={`border-2 rounded-lg p-4 ${getSectionColor(branch, section)}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-800">
                      {branch} - Section {section} ({totalStudents} students)
                    </h3>
                    <div className="flex items-center gap-2">
                      {hasError && <AlertCircle className="text-red-500" size={20} />}
                      {hasPartial && !hasError && <AlertCircle className="text-yellow-500" size={20} />}
                      {!hasPartial && !hasError && <CheckCircle className="text-green-500" size={20} />}
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {sectionAllocations.map((alloc, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-md ${
                          alloc.error
                            ? 'bg-red-100 border border-red-300'
                            : alloc.emergency
                              ? 'bg-yellow-50 border border-yellow-300'
                              : 'bg-white border border-gray-200'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-medium text-gray-800">Room: {alloc.roomNo}</span>
                            {alloc.blockName && (
                              <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                                {alloc.blockName}
                              </span>
                            )}
                            {!alloc.error && (
                              <div className="text-gray-600 mt-1">
                                Seats: {alloc.startSeat}-{alloc.endSeat} ({alloc.students} students)
                              </div>
                            )}
                          </div>
                          {alloc.partial && (
                            <span className="px-2 py-1 bg-yellow-200 text-yellow-800 text-xs rounded-full">
                              Partial
                            </span>
                          )}
                          {alloc.emergency && (
                            <span className="px-2 py-1 bg-orange-200 text-orange-800 text-xs rounded-full">
                              Emergency
                            </span>
                          )}
                          {alloc.error && (
                            <span className="px-2 py-1 bg-red-200 text-red-800 text-xs rounded-full">
                              No Space
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Algorithm Explanation */}
      <div className="max-w-3xl mx-auto mt-10 p-6 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="text-lg font-semibold mb-2 text-blue-800">How this algorithm works:</h3>
        <p className="text-blue-900 leading-relaxed">{ALGO_EXPLANATIONS[algorithm]}</p>
      </div>
    </div>
  );
};

export default ExamSeatingAllocator;

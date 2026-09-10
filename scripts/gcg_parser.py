import json
import re
import sys
import os
import glob


def create_empty_board():
    return [["" for _ in range(15)] for _ in range(15)]


def parse_gcg(file_path):
    board = create_empty_board()
    tile_owners = create_empty_board()

    # We lock your username to ensure tile colors map to "me" (blue) vs "opp" (red)
    my_name = "thepenguinishere"
    p1_score, p2_score = 0, 0
    final_rack = ""

    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    for line in lines:
        line = line.strip()

        # Skip empty lines or game metadata
        if not line or line.startswith("#") or line.startswith("!"):
            continue

        # Parse the play data
        if line.startswith(">"):
            parts = line.split()
            # Standard GCG format: >Player: RACK COORD WORD SCORE TOTAL
            if len(parts) >= 6:
                player = parts[0][1:-1]  # Strip '>' and ':'
                rack = parts[1]
                coord = parts[2]
                word = parts[3]
                total_str = parts[5]

                is_me = player.lower() == my_name.lower()
                owner_mark = "me" if is_me else "opp"

                if is_me:
                    p1_score = int(total_str)
                    final_rack = rack
                else:
                    p2_score = int(total_str)

                # Skip exchanges (denoted by '-' or missing coordinates)
                if coord == "-" or not any(c.isdigit() for c in coord):
                    continue

                # Regex magic: Split Letter/Number vs Number/Letter
                m = re.match(r"([A-Oa-o])(\d+)|(\d+)([A-Oa-o])", coord)
                if not m:
                    continue

                if m.group(1):  # Vertical (e.g. H8)
                    c_idx = ord(m.group(1).upper()) - ord("A")
                    r_idx = int(m.group(2)) - 1
                    d_row, d_col = 1, 0
                else:  # Horizontal (e.g. 8H)
                    r_idx = int(m.group(3)) - 1
                    c_idx = ord(m.group(4).upper()) - ord("A")
                    d_row, d_col = 0, 1

                # GCG puts existing board tiles in parenthesis. We strip them
                # because we calculate ownership by checking if the square is empty.
                clean_word = re.sub(r"[()\[\]]", "", word)

                curr_r, curr_c = r_idx, c_idx
                for char in clean_word:
                    if 0 <= curr_r < 15 and 0 <= curr_c < 15:
                        # If the board is empty here, we place the tile and assign ownership.
                        # Note: GCG uses lowercase for blanks, which our React app already supports!
                        if not board[curr_r][curr_c]:
                            board[curr_r][curr_c] = char
                            tile_owners[curr_r][curr_c] = owner_mark
                    curr_r += d_row
                    curr_c += d_col

    # Compile the React-compatible JSON state
    game_state = {
        "board": board,
        "tileOwners": tile_owners,
        "rack": final_rack.replace(
            ".", "?"
        ),  # Convert GCG rack blanks to our UI format
        "myScore": str(p1_score),
        "oppScore": str(p2_score),
        "activePresetKey": "scrabble",
        "intelMode": "auto",
        "manualAvailableTiles": "",
    }

    output_file = file_path.replace(".gcg", ".json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(game_state, f, indent=2)

    print(f"✔ Compiled: {os.path.basename(output_file)}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python gcg_parser.py <file.gcg or directory>")
    else:
        target = sys.argv[1]
        if os.path.isdir(target):
            # Batch process the entire directory
            for f in glob.glob(os.path.join(target, "*.gcg")):
                parse_gcg(f)
        else:
            parse_gcg(target)

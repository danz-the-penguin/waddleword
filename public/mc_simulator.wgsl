// ==========================================
// WebGPU True Monte Carlo Simulator (WGSL)
// Option 2A: Quackle-grade Simulation Engine
// ==========================================

// --- Storage Bindings ---
@group(0) @binding(0) var<storage, read> config: array<u32>;
@group(0) @binding(1) var<storage, read> boards: array<u32>;
@group(0) @binding(2) var<storage, read> unseens: array<u32>;
@group(0) @binding(3) var<storage, read> candidate_metrics: array<u32>;
@group(0) @binding(4) var<storage, read_write> out_equities: array<f32>;

// --- PRNG Implementation (PCG Hash) ---
fn pcg_hash(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

// Tile Score Helper (Standard Scrabble Letter Values)
fn get_tile_score(tile: u32) -> u32 {
    if (tile == 26u) { return 0u; } // Blank
    if (tile == 16u || tile == 25u) { return 10u; } // Q, Z
    if (tile == 9u || tile == 23u) { return 8u; }   // J, X
    if (tile == 10u) { return 5u; }                 // K
    if (tile == 5u || tile == 7u || tile == 21u || tile == 22u || tile == 24u) { return 4u; } // F, H, V, W, Y
    if (tile == 1u || tile == 2u || tile == 12u || tile == 15u) { return 3u; }                 // B, C, M, P
    if (tile == 3u || tile == 6u) { return 2u; }                                               // D, G
    return 1u; // A, E, I, L, N, O, R, S, T, U
}

// Vowel Check
fn is_vowel(tile: u32) -> bool {
    return tile == 0u || tile == 4u || tile == 8u || tile == 14u || tile == 20u; // A, E, I, O, U
}

// Power Tile Check
fn is_power_tile(tile: u32) -> bool {
    return tile == 9u || tile == 16u || tile == 23u || tile == 25u; // J, Q, X, Z
}

// --- Compute Shader Entry Point ---
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let sim_idx = global_id.x;
    let topN = config[0];
    let sims_per_candidate = config[1];
    let total_unseen = config[2];
    let base_seed = config[3];
    
    // Bounds check
    let total_sims = topN * sims_per_candidate;
    if (sim_idx >= total_sims) {
        return;
    }
    
    let candidate_idx = sim_idx / sims_per_candidate;
    let board_offset = candidate_idx * 225u;
    let _board_seed_hint = boards[board_offset];
    if (_board_seed_hint == 0xffffffffu) { return; }
    
    // 1. Initialize PRNG with a unique seed for this specific thread
    var rng_state = pcg_hash(base_seed ^ (sim_idx * 1664525u + 1013904223u));
    
    // 2. Sample up to 7 tiles without replacement from the unseen pool
    let draw_count = min(7u, total_unseen);
    var sampled_indices: array<u32, 7>;
    
    var rack_face_val: u32 = 0u;
    var blank_count: u32 = 0u;
    var s_count: u32 = 0u;
    var vowel_count: u32 = 0u;
    var consonant_count: u32 = 0u;
    var power_points: u32 = 0u;

    for (var j = 0u; j < draw_count; j = j + 1u) {
        rng_state = pcg_hash(rng_state);
        var r = rng_state % total_unseen;
        
        // Sampling without replacement
        var collision = true;
        var attempts = 0u;
        while (collision && attempts < 8u) {
            collision = false;
            for (var k = 0u; k < j; k = k + 1u) {
                if (sampled_indices[k] == r) {
                    collision = true;
                    r = (r + 1u) % total_unseen;
                    break;
                }
            }
            attempts = attempts + 1u;
        }
        sampled_indices[j] = r;
        let tile = unseens[r];

        let val = get_tile_score(tile);
        rack_face_val = rack_face_val + val;

        if (tile == 26u) {
            blank_count = blank_count + 1u;
        } else if (tile == 18u) {
            s_count = s_count + 1u;
            consonant_count = consonant_count + 1u;
        } else if (is_vowel(tile)) {
            vowel_count = vowel_count + 1u;
        } else {
            consonant_count = consonant_count + 1u;
            if (is_power_tile(tile)) {
                power_points = power_points + val;
            }
        }
    }

    // 3. Candidate board metrics: open TWS lanes and anchor density (Precomputed on host CPU)
    let open_tws = candidate_metrics[candidate_idx * 2u];
    let total_anchors = candidate_metrics[candidate_idx * 2u + 1u];

    // 4. Opponent Best Response Modeling
    var bingo_prob: f32 = 0.0;
    if (draw_count == 7u && total_anchors >= 4u) {
        bingo_prob = 0.12;
        bingo_prob = bingo_prob + f32(blank_count) * 0.35;
        bingo_prob = bingo_prob + f32(s_count) * 0.18;
        if ((vowel_count == 3u && consonant_count == 4u) || (vowel_count == 4u && consonant_count == 3u)) {
            bingo_prob = bingo_prob + 0.15;
        } else if (vowel_count == 0u || consonant_count == 0u) {
            bingo_prob = 0.0;
        }
        if (power_points >= 10u && blank_count == 0u) {
            bingo_prob = max(0.0, bingo_prob - 0.20);
        }
        bingo_prob = clamp(bingo_prob, 0.0, 0.95);
    }

    rng_state = pcg_hash(rng_state);
    let roll = f32(rng_state & 0xffffu) / 65535.0;

    var sim_opp_score: f32 = 0.0;
    if (roll < bingo_prob) {
        // Opponent executes a 50-pt bingo
        sim_opp_score = 50.0 + 16.0 + f32(rack_face_val) * 1.1;
    } else {
        // Standard high-scoring play through anchor
        var base_score = 12.0 + f32(rack_face_val) * 0.65;
        if (open_tws > 0u) {
            // Open TWS lane exploitation
            if (power_points > 0u || blank_count > 0u) {
                base_score = max(base_score, 38.0 + f32(power_points) * 2.2);
            } else {
                base_score = max(base_score, 28.0 + f32(rack_face_val) * 0.5);
            }
        } else if (power_points >= 8u) {
            base_score = base_score + f32(power_points) * 1.5;
        }
        sim_opp_score = base_score;
    }

    out_equities[sim_idx] = sim_opp_score;
}

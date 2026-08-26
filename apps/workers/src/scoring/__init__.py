from dataclasses import dataclass


@dataclass
class AccountProfile:
    username: str
    follower_count: int = 0
    following_count: int = 0
    post_count: int = 0
    bio: str = ""
    is_private: bool = False
    is_business: bool = False
    account_age_days: int = 0
    avg_likes_per_post: float = 0.0
    avg_comments_per_post: float = 0.0
    has_profile_pic: bool = True

def calculate_quality_score(profile: AccountProfile) -> int:
    score = 50.0
    if profile.following_count > 0:
        ratio = profile.follower_count / profile.following_count
        if ratio < 0.1: score -= 20
        elif ratio < 0.5: score -= 10
        elif 0.8 <= ratio <= 5: score += 10
        elif ratio > 20: score += 5
    else: score -= 10
    if profile.post_count == 0: score -= 25
    elif profile.post_count < 5: score -= 10
    elif profile.post_count < 20: score -= 5
    elif 20 <= profile.post_count <= 500: score += 10
    elif profile.post_count > 2000: score += 5
    if profile.follower_count > 0 and profile.avg_likes_per_post > 0:
        er = profile.avg_likes_per_post / profile.follower_count
        if er < 0.001: score -= 15
        elif er < 0.01: score -= 5
        elif 0.02 <= er <= 0.15: score += 15
        elif er > 0.3: score += 5
    if profile.account_age_days < 30: score -= 20
    elif profile.account_age_days < 90: score -= 10
    elif profile.account_age_days > 365: score += 10
    elif profile.account_age_days > 730: score += 5
    if not profile.has_profile_pic: score -= 20
    if not profile.bio or len(profile.bio) < 5: score -= 10
    elif len(profile.bio) > 50: score += 5
    if profile.is_private: score += 5
    return max(0, min(100, int(score)))

def estimate_follow_probability(profile: AccountProfile, niche_match_score: float = 0.5) -> float:
    if profile.follower_count == 0: return 0.0
    prob = 0.05
    prob += niche_match_score * 0.25
    if profile.follower_count > 0:
        ff = profile.following_count / profile.follower_count
        if ff > 5: prob += 0.15
        elif ff > 2: prob += 0.10
        elif ff > 1: prob += 0.05
        elif ff < 0.3: prob -= 0.03
    if profile.post_count > 50: prob += 0.03
    elif profile.post_count < 5: prob -= 0.02
    if profile.following_count > 1000: prob += 0.05
    elif profile.following_count < 100: prob -= 0.02
    if profile.is_private: prob -= 0.02
    return max(0.0, min(1.0, prob))

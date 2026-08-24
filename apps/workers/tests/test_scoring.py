from src.scoring import AccountProfile, calculate_quality_score, estimate_follow_probability

class TestQualityScore:
    def test_in_range(self):
        p = AccountProfile(username="t", follower_count=1000, following_count=500, post_count=50)
        assert 0 <= calculate_quality_score(p) <= 100
    def test_low_quality(self):
        p = AccountProfile(username="t", follower_count=10, following_count=5000, post_count=0, has_profile_pic=False)
        assert calculate_quality_score(p) < 30
    def test_high_quality(self):
        p = AccountProfile(username="t", follower_count=5000, following_count=300, post_count=100, avg_likes_per_post=500, account_age_days=730, has_profile_pic=True)
        assert calculate_quality_score(p) > 60
    def test_boundaries(self):
        p0 = AccountProfile(username="t", follower_count=0, following_count=10000, post_count=0, has_profile_pic=False, account_age_days=1)
        assert calculate_quality_score(p0) >= 0

class TestFollowProbability:
    def test_in_range(self):
        p = AccountProfile(username="t", follower_count=1000, following_count=500)
        assert 0.0 <= estimate_follow_probability(p) <= 1.0
    def test_niche_match_effect(self):
        p = AccountProfile(username="t", follower_count=1000, following_count=500)
        assert estimate_follow_probability(p, 0.9) > estimate_follow_probability(p, 0.1)
    def test_ff_ratio_effect(self):
        hi = AccountProfile(username="t", follower_count=100, following_count=2000)
        lo = AccountProfile(username="t", follower_count=2000, following_count=100)
        assert estimate_follow_probability(hi) > estimate_follow_probability(lo)

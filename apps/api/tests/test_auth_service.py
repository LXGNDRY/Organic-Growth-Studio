from app.services.auth_service import hash_password, verify_password

class TestPasswords:
    def test_hash_returns_string(self):
        assert isinstance(hash_password("test"), str)

    def test_verify_correct(self):
        h = hash_password("secret123")
        assert verify_password("secret123", h) is True

    def test_verify_wrong(self):
        h = hash_password("correct")
        assert verify_password("wrong", h) is False

    def test_unique_salts(self):
        a = hash_password("same")
        b = hash_password("same")
        assert a != b

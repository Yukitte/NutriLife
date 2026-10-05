import os

from pymongo import MongoClient

class ConfigDB:
    MONGO_URI = os.getenv("MONGODB_URI")
    MONGODB_DATABASE = os.getenv("MONGODB_DATABASE")
    client = None
    db = None

    @classmethod
    def connect(cls):
        cls.client = MongoClient(cls.MONGO_URI)
        cls.db = cls.client['nutrilife_db']
        print("Conectado ao MongoDB Atlas!")

    @classmethod
    def get_db(cls):
        return cls.db
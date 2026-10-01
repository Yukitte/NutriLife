from functools import lru_cache

from pymongo import MongoClient

from settings import get_settings


@lru_cache
def get_client() -> MongoClient:
    return MongoClient(get_settings().mongodb_uri, serverSelectionTimeoutMS=5000)


def get_database():
    return get_client()[get_settings().mongodb_database]
